# MedTrack

I wanted to get some hands-on practice with Angular 21, AWS serverless infrastructure, and the Anthropic API, and I wanted a real-world usecase building chat agents -- so I built a medication adherence dashboard for a fictional health insurance and drug delivery company. The domain turned out to be a great fit: healthcare has real compliance constraints, genuinely interesting AI use cases, and enough complexity to make the architectural decisions matter.

This is a portfolio project. I built it to learn, and this README describes the journey.

---

## What It Does

Members can view their active prescriptions, see how adherent they've been (days since last fill divided by days supply), and get flagged when they're overdue for a refill. Care coordinators get a panel view across their members and a natural language interface for querying it. Members get a conversational chat interface for asking questions about their own medications.

Under the hood, three AI agents handle the operational work: one runs autonomously on a schedule, one powers the coordinator's chat interface, and one powers the member chat.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 21, standalone components, signals, OnPush, SCSS |
| Backend | AWS Lambda (Node.js 22), API Gateway |
| Database | DynamoDB, single-table design |
| Infrastructure | AWS CDK (TypeScript) |
| AI | Anthropic Claude (via Bedrock in production, direct API in dev) |
| Testing | Playwright E2E, Cucumber/Gherkin BDD |
| Package manager | pnpm |

---

## What I Learned

### Angular 21

I came into this with more recent React/Next than Angluar experience and had to relearn a few things. I've used dependency injection in Java Spring, and Angular's dependency injection system is pretty cool — injecting a `PrescriptionsService` singleton is just `inject(PrescriptionsService)`, no prop drilling, no context providers, no store boilerplate, *NO REDUX* for simple cases.

Signals were new to me and I dig them. A signal is a value that knows when it changes and tells Angular about it. Combined with `computed()` for derived state and `OnPush` change detection, the result is a component tree that only re-renders what actually needs to — and you can reason about it easily.

I was also glad to see some of the `*ngIf` and `*ngFor` language has been replace. I like Angular 21's native control flow (`@if`, `@for`) as it's cleaner and the `track` expression in `@for` does what `trackBy` used to do, more concisely.

One thing that surprised me: the `InjectionToken` pattern for non-class values. I injected the current date as `InjectionToken<() => Date>` rather than calling `new Date()` directly in the service. It sounds like over-engineering until I tried to write a deterministic test for adherence calculation — suddenly having a fixed, injectable date factory is obviously correct. Same principle for the API base URL.  Fortunately it was an easy refactor.

### RxJS

`HttpClient` returns Observables, so I worked with them as Observables rather than converting to Promises. The `async` pipe in templates handles subscription and cleanup automatically, which prevents the memory leak category of bugs entirely. I didn't need most of RxJS for this project, but I've been meaning to try it for while and I understand now why it exists.  I've been a fan of observables since the days of RSS.

### DynamoDB Single-Table Design

This was the biggest conceptual shift in the backend work. Coming from relational databases and having only done a bit of MongoDB, the instinct is to design a schema and figure out queries later. DynamoDB inverts that: you list every query your application needs to make, then design the key structure to make each one efficient without a scan.

MedTrack's table uses composite keys with SK prefixes (`RX#`, `REFILL#`, `REVIEW#`) to co-locate multiple entity types under a member partition. The one cross-member query — finding all overdue prescriptions across all members — gets a dedicated GSI (`StatusIndex`) rather than a table scan. Once I was able to get my head around GSI (indexes!  sorta) and what problem it solves it was smoother sailing, but I'd probably need to use a few more to truly understand.  

### AWS Lambda and CDK

I hadn't used CDK in quite this way before.  Most of the projects I've worked on have had it already set up. Writing infrastructure as TypeScript — with autocomplete, type checking, and `grantReadData()` generating the correct IAM policy automatically — made the operational side of the project run a bit more smoothly than than I expected. 

Lambdas are cool, and straightforward once you stop thinking about servers (and Python) entirely. The agent Lambdas use esbuild bundling via `NodejsFunction`, which inlines only the dependencies each file actually uses. Cold starts are fast and package sizes stay small.

### LocalStack vs. Real AWS

I started the backend development against the Docker-based AWS emulator LocalStack, expecting it to simplify local iteration. It worked well enough for DynamoDB and the basic Lambda setup, but as the project grew the overhead started to outweigh the benefits. Managing the Docker daemon, keeping LocalStack's emulated services in sync with CDK changes, and debugging discrepancies between LocalStack behavior and real AWS behavior added friction that was more frustrating then necessary.

Once I switched to deploying directly to AWS the overhead disappeared and it turned out to be faster, more reliable, and closer to production behavior. The CDK deploy cycle is quick enough that it doesn't slow down iteration meaningfully. Between LocalStack and AWS I felt there was maybe a bit too much of an "uncanny valley" for what I was trying to accomplish.

### Anthropic Tools and the ReAct Pattern

This was the part I was most curious about going in. Tool calling is how you give a language model the ability to do something rather than just say something. You define tools with names, descriptions, and parameter schemas. The model reads the descriptions to decide when to use each tool, returns a structured tool call instead of a text response, and your code executes it.

The Coordinator Copilot uses a ReAct loop — Reason, Act, observe result, Reason again — because the coordinator's questions are open-ended. Claude doesn't know upfront which members it needs or what filters to apply, so it drives the retrieval dynamically across multiple turns.

The Member Chat uses a different pattern: RAG-lite. Before every call, the Lambda retrieves the member's prescriptions from DynamoDB and injects them into the system prompt. Claude answers grounded in that context, no tool calls needed. The retrieval domain is always exactly one member's records — small, structured, bounded. A full RAG pipeline with a vector database would be over-engineering for this case.

The Refill Agent is simpler than both: single-shot tool calling on a schedule. One message to Claude with the overdue prescription list and two tool definitions, one set of tool calls back, done.

### Amazon Bedrock (the war)

The production architecture was meant to use Bedrock rather than the direct Anthropic API because prescription data is PHI. Bedrock is HIPAA-eligible — AWS will sign a BAA covering inference workloads, PHI stays within the AWS security boundary, access is controlled through IAM roles rather than API keys, and every invocation appears in CloudTrail.

In practice, I spent an afternoon debugging `ThrottlingException: Too many tokens per day` errors despite sending tiny curl requests. The eventual diagnosis: my AWS account was never provisioned with default Bedrock inference quotas. Every on-demand and cross-region inference quota was stuck at 0. The Bedrock playground threw the same error. The fix required submitting quota increase requests via the AWS CLI (the console showed the quotas as non-adjustable) and opening an AWS Support case. Both requests are sitting in `CASE_OPENED` status.

Becausse this is actual PHI, I switched to direct Claude API calls. Switching back to Bedrock requires changing one line — the client instantiation. The architectural argument for Bedrock stands regardless of which client is active.

This was a genuinely useful thing to debug. Knowing what `ThrottlingException` actually means in a new AWS account, how to diagnose it with `list-service-quotas`, and how to distinguish a provisioning failure from an actual rate limit is useful operational knowledge.  I've become obsessed with keeping token costs down and now I've got a pretty good idea of how to do it with Bedrock.

---

## The Agents

Three agents, three patterns:

**Refill Agent** runs daily via EventBridge. It queries DynamoDB for overdue prescriptions, sends them to Claude with two tool definitions, and Claude decides per prescription whether to trigger a refill automatically or flag it for human review. Autonomous, no UI.

**Coordinator Copilot** is a chat interface for care coordinators. Natural language queries — "show me all members overdue on statins" — get translated into tool calls via a ReAct loop. Claude drives the retrieval, coordinators confirm bulk actions before execution.  This is was something I had only read about and it was fun to put it into practice.

**Member Chat** is a conversational interface scoped to a single authenticated member. The member's prescription records are retrieved from DynamoDB before each call and injected as context. Claude answers grounded in real data. The `memberId` always comes from the authenticated session — never from anything the user typed.  In theory.  

The foundational architectural rule across all three: **agents never access DynamoDB directly. They call Lambda tool functions. The LLM reasons; the tools act.** Every write action is independently logged, testable, and auditable — a requirement for anything touching PHI.

---

## Testing

**Cucumber/Gherkin BDD** — two feature files covering adherence flagging and refill triggering. Step definitions run TypeScript directly via the `tsx/cjs` loader. The adherence calculation is a pure function with no Angular dependencies, so it imports directly into step definitions without bootstrapping a DI context. All scenarios passing.

**Playwright E2E** — two tests covering the happy path and risk flag scenarios. `getByRole()` throughout, which tests the accessibility tree rather than DOM structure. Both passing.

---

## Running It

```bash
# Frontend
pnpm install
pnpm start              # http://localhost:4200

# Tests
pnpm run cucumber       # BDD specs
pnpm run e2e            # Playwright

# Deploy backend to AWS (from backend/)
pnpm build              # Compile Lambdas
pnpm run cdk deploy     # Requires AWS credentials configured
```

---

## What I'd Do Differently

The Bedrock quota issue was avoidable — I should have validated Bedrock access on a test account before building the full agent layer against it. The workaround was straightforward once I figured out what the issue was but getting there cost half a day.

I'd also skip LocalStack entirely from the start. The real AWS free tier covers everything this project uses. The simulation adds overhead and the behavioral differences are a hidden cost that grew and grew as the project progressed.  I don't know a lot about LocalStack and I'm sure it had it's advantages, but AWS was just easier from the start.  

It was only after I'd built the three simple agents that I saw the need and potential for more of an AI orchestration layer.  If I ever pick this up again that's clearly the next step.  I'd spend more time planning on paper rather than just jumping right in.

---

## What's Next

As I just mentioned, the natural expansion (and where the real AI value of this project lies) is an orchestration layer — a planning agent that runs nightly, does a triage pass across the coordinator's panel, delegates to specialist agents (Gap in Care, Readmission Risk, Formulary Switch), tracks what it's already flagged via a `CASE#` entity type in DynamoDB, and synthesizes a morning briefing. As the project evolved the potential use cases became more and more clear.  For instance the primary triggering mechanism would be event-driven rather than nightly — a discharge recorded at 3pm shouldn't wait until 2am for the Readmission Risk Agent to notice.  There is also some potentual for connecting to existing pharma APIs to flag things like drug interactions or track over-prescribing.
