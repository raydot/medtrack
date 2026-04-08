# MedTrack

I wanted to get some hands-on practice with Angular 21, AWS serverless infrastructure, and the Anthropic API, and I wanted a real-world usecase building chat agents -- so I built a medication adherence dashboard for a fictional health insurance and drug delivery company. The domain turned out to be a great fit: healthcare has real compliance constraints, genuinely interesting AI use cases, and enough complexity to make the architectural decisions matter.

This is a portfolio project, built to learn. This README describes the process.

---

## What It Does

Members can view their active prescriptions, see how adherent they've been (days since last fill divided by days supply), and get flagged when they're overdue for a refill. Care coordinators get a panel view across their members and a natural language interface for querying it. Members get a conversational chat interface for asking questions about their own medications.

Under the hood, six AI agents handle the operational work: one runs autonomously on a schedule, one powers the coordinator's chat interface, and one powers the member chat.  The other three check for gaps in member care, readmission risk, and the need for a formulary switch.  All of these run on sample data.

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

I came into this with more recent React/Next than Angular experience and had to relearn a few things. I've used dependency injection in Java Spring, and Angular's dependency injection system is pretty cool — injecting a `PrescriptionsService` singleton is just `inject(PrescriptionsService)`, no prop drilling, no context providers, no store boilerplate, *NO REDUX* for simple cases.

Signals were new to me and I dig them. A signal is a value that knows when it changes and tells Angular about it. Combined with `computed()` for derived state and `OnPush` change detection, the result is a component tree that only re-renders what actually needs to — and you can reason about it easily.

I was also glad to see some of the `*ngIf` and `*ngFor` language has been replaced. I like Angular 21's native control flow (`@if`, `@for`) as it's cleaner and the `track` expression in `@for` does what `trackBy` used to do, more concisely.

One thing that surprised me: the `InjectionToken` pattern for non-class values. I injected the current date as `InjectionToken<() => Date>` rather than calling `new Date()` directly in the service. It sounds like over-engineering until I tried to write a deterministic test for adherence calculation — suddenly having a fixed, injectable date factory is obviously correct. Same principle for the API base URL. Fortunately it was an easy refactor.

### RxJS

`HttpClient` returns Observables, so I worked with them as Observables rather than converting to Promises. The `async` pipe in templates handles subscription and cleanup automatically, which prevents the memory leak category of bugs entirely. I didn't need most of RxJS for this project, but I've been meaning to try it for a while and I understand now why it exists. I've been a fan of observables since the days of RSS.

### DynamoDB Single-Table Design

This was the biggest conceptual shift in the backend work. Coming from relational databases and having only done a bit of MongoDB and DynamoDB, the instinct is to design a schema and figure out queries later. DynamoDB inverts that: you list every query your application needs to make, then design the key structure to make each one efficient without a scan.

MedTrack's table uses composite keys with SK prefixes (`RX#`, `REFILL#`, `REVIEW#`) to co-locate multiple entity types under a member partition. The one cross-member query — finding all overdue prescriptions across all members — gets a dedicated GSI (`StatusIndex`) rather than a table scan. Once I was able to get my head around GSIs (indexes! sorta) and what problem they solve it was smoother sailing, but I'd probably need to use a few more to truly understand.

### AWS Lambda and CDK

I hadn't used CDK in quite this way before. Most of the projects I've worked on have had it already set up. Writing infrastructure as TypeScript — with autocomplete, type checking, and `grantReadData()` generating the correct IAM policy automatically — made the operational side of the project run more smoothly than I expected.

Lambdas are cool, and straightforward once you stop thinking about servers (and Python) entirely. The agent Lambdas use esbuild bundling via `NodejsFunction`, which inlines only the dependencies each file actually uses. Cold starts are fast and package sizes stay small.

### LocalStack vs. Real AWS

I started the backend development against the Docker-based AWS emulator LocalStack, expecting it to simplify local iteration. It worked well enough for DynamoDB and the basic Lambda setup, but as the project grew the overhead started to outweigh the benefits. Managing the Docker daemon, keeping LocalStack's emulated services in sync with CDK changes, and debugging discrepancies between LocalStack behavior and real AWS behavior added friction that was more frustrating than necessary.

Once I switched to deploying directly to AWS the overhead disappeared and it turned out to be faster, more reliable, and closer to production behavior. The CDK deploy cycle is quick enough that it doesn't slow down iteration meaningfully. Between LocalStack and AWS I felt there was maybe a bit too much of an "uncanny valley" for what I was trying to accomplish.

I'd skip LocalStack entirely from the start on a future project. The real AWS free tier covers everything this project uses. The simulation adds overhead and the behavioral differences are a hidden cost that grows as the project progresses.

### Anthropic Tools and the ReAct Pattern

This was the part I was most curious about going in. Tool calling is how you give a language model the ability to do something rather than just say something. You define tools with names, descriptions, and parameter schemas. The model reads the descriptions to decide when to use each tool, returns a structured tool call instead of a text response, and your code executes it.

The Coordinator Copilot uses a ReAct loop — Reason, Act, observe result, Reason again — because the coordinator's questions are open-ended. Claude doesn't know upfront which members it needs or what filters to apply, so it drives the retrieval dynamically across multiple turns.

The Member Chat uses a different pattern: RAG-lite. Before every call, the Lambda retrieves the member's prescriptions from DynamoDB and injects them into the system prompt. Claude answers grounded in that context, no tool calls needed. The retrieval domain is always exactly one member's records — small, structured, bounded. A full RAG pipeline with a vector database would be over-engineering for this case.

The Refill Agent is simpler than both: single-shot tool calling on a schedule. One message to Claude with the overdue prescription list and two tool definitions, one set of tool calls back, done.

### Amazon Bedrock (the war)

The production architecture was meant to use Bedrock rather than the direct Anthropic API because prescription data is PHI. Bedrock is HIPAA-eligible — AWS will sign a BAA covering inference workloads, PHI stays within the AWS security boundary, access is controlled through IAM roles rather than API keys, and every invocation appears in CloudTrail.

In practice, I spent an afternoon debugging `ThrottlingException: Too many tokens per day` errors despite sending tiny curl requests. The eventual diagnosis: my AWS account was never provisioned with default Bedrock inference quotas. Every on-demand and cross-region inference quota was stuck at 0. The Bedrock playground threw the same error. The fix required submitting quota increase requests via the AWS CLI (the console showed the quotas as non-adjustable) and opening an AWS Support case. Both requests are sitting in `CASE_OPENED` status.

Because this involves actual PHI, I switched to direct Claude API calls. Switching back to Bedrock requires changing one line — the client instantiation. The architectural argument for Bedrock stands regardless of which client is active.

This was a genuinely useful thing to debug. Knowing what `ThrottlingException` actually means in a new AWS account, how to diagnose it with `list-service-quotas`, and how to distinguish a provisioning failure from an actual rate limit is useful operational knowledge. I've become obsessed with keeping token costs down and now I've got a pretty good idea of how to do it with Bedrock.

---

## The Agents

Six agents, four patterns:

**Refill Agent** runs daily via EventBridge. It queries DynamoDB for overdue prescriptions, sends them to Claude with two tool definitions, and Claude decides per prescription whether to trigger a refill automatically or flag it for human review. Autonomous, no UI.

**Coordinator Copilot** is a chat interface for care coordinators. Natural language queries — "show me all members overdue on statins" — get translated into tool calls via a ReAct loop. Claude drives the retrieval, coordinators confirm bulk actions before execution. This was something I had only read about and it was fun to put into practice.

**Member Chat** is a conversational interface scoped to a single authenticated member. The member's prescription records are retrieved from DynamoDB before each call and injected as context. Claude answers grounded in real data. The memberId always comes from the authenticated session — never from anything the user typed. In theory.

**Gap in Care** identifies members with diagnoses that have no corresponding medication on record. Invoked by the Orchestrator triage pass; writes a CASE# record via the OpenCase Lambda when a gap is found.

**Readmission Risk** monitors recently discharged members within their readmission window. Urgency is tiered by days since discharge. Also invoked by the Orchestrator.

**Formulary Switch** identifies prescriptions where the drug's formulary tier has changed, drafts prescriber outreach, and requires coordinator approval before anything is sent. Hard human-in-the-loop by design.

The foundational architectural rule across all six: agents never access DynamoDB directly. They call Lambda tool functions. The LLM reasons; the tools act. Every write action is independently logged, testable, and auditable — a requirement for anything touching PHI.

---

## The Orchestration Layer

It was only after building the three simple agents that the need for a coordination layer became clear. The agents were working independently but nothing was deciding when to run them, preventing duplicate work, or synthesizing what they'd done into something a coordinator could act on.

The Orchestrator runs nightly via EventBridge. It pulls all members, does a rules-based triage pass (no LLM involved), checks operational memory to avoid re-flagging cases already in progress, delegates to specialist agents — Gap in Care, Readmission Risk, Formulary Switch — and synthesizes a morning briefing for coordinators via Claude.

Operational memory is a `CASE#` entity type in DynamoDB. Before invoking any specialist agent, the Orchestrator checks whether an open case already exists for that member and agent type. If one does, it skips. This prevents the system from generating duplicate outreach for the same clinical event.

The primary triggering mechanism in a production system would be event-driven rather than nightly — a discharge recorded at 3pm shouldn't wait until 2am for the Readmission Risk Agent to notice. That's the natural next step.

---

## Testing

**Cucumber/Gherkin BDD** — two feature files covering adherence flagging and refill triggering. Step definitions run TypeScript directly via the `tsx/cjs` loader. The adherence calculation is a pure function with no Angular dependencies, so it imports directly into step definitions without bootstrapping a DI context. All scenarios passing.

**Playwright E2E** — two tests covering the happy path and risk flag scenarios. `getByRole()` throughout, which tests the accessibility tree rather than DOM structure. Both passing.

---

## Observability and CI

After building the orchestration layer, the natural next question was: how do you know it's working? Shipping an AI system without observability is flying blind — you can't see what the model was sent, what it returned, how long it took, or what it cost.

### Langfuse

I added [Langfuse](https://langfuse.com) for LLM observability. Every Anthropic call across the system now produces a generation span capturing the model, input prompt, output, token usage, and latency. The Orchestrator wraps each run in a parent trace with member spans showing which members were processed and which agents fired.

Opening Langfuse after a run shows exactly what Claude was sent and what it responded with for every agent invocation, how long each call took, token counts per generation, and the morning briefing input and output side by side. With multiple runs accumulated, p50/p95 latency percentiles show what a typical orchestration run costs in time and what the worst normal case looks like — a more honest picture than averages, which a single slow Lambda cold start can distort significantly.

Cross-Lambda trace context is propagated via the invoke payload — `traceId` and `parentObservationId` pass from the Orchestrator to each specialist Lambda explicitly. All generations appear under the same trace. True hierarchical nesting across separate Lambda execution environments would require Langfuse's low-level server-side API rather than the client SDK, which tracks parent-child relationships within a single process. The flat-but-grouped view is sufficient for debugging and cost analysis.

### CI Pipeline

I added a GitHub Actions workflow that runs on every push to main. The pipeline:

1. Deploys a fresh ephemeral `MedTrackCIStack` via CDK
2. Seeds it with deterministic test data (discharge dates are relative — computed at seed time — so they never go stale)
3. Invokes the Orchestrator against the CI stack
4. Runs four quality checks and fails the build if any fail
5. Tears down the CI stack regardless of outcome

The four quality checks:

- **qm-01**: Control member with no diagnoses, discharge, or overdue meds triggers zero agent invocations
- **qm-02**: Member with Hypertension and no BP medication triggers the Gap in Care agent
- **qm-03**: Member discharged 10 days ago triggers the Readmission Risk agent
- **qm-04**: Morning briefing contains CRITICAL, URGENT, and ROUTINE sections

Quality scores are posted to Langfuse so quality history accumulates over time, not just pass/fail in the terminal.

### The Teardown Problem

One thing I didn't anticipate: CI runs against DynamoDB accumulate case records, operational memory entries, and CloudWatch log groups that contaminate subsequent runs. A seed script alone isn't enough — you need a teardown first. The full reset sequence is:

1. Delete CI DynamoDB tables
2. Delete Lambda log groups
3. Destroy the CDK stack
4. Redeploy
5. Reseed

I wrote a `teardown-ci.sh` script that handles steps 1-3. The workflow runs it at the start of every CI run and again as a cleanup step at the end via `if: always()` — so the stack tears down even when the quality checks fail.

The `medtrack-ci` IAM user that runs in GitHub Actions is scoped to exactly what CDK needs — DynamoDB read/write on CI tables, Lambda invoke and create/delete on CI functions, CloudFormation for the CI stack, S3 for CDK asset uploads, and SSM for CDK bootstrap version checking. No access to production resources.

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
pnpm run cdk deploy     # Requires AWS credentials configured

# CI reset (from backend/)
bash scripts/teardown-ci.sh
npx cdk deploy MedTrackCIStack --require-approval never
bash scripts/seed-ci.sh
```

---

## References

Two papers I read and tried to put into use in this project:

[ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/pdf/2210.03629) by Yao, et al.

[Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/pdf/2005.11401) by Lewis et al., specifically as it informs the concept of [Tools in Anthropic's Claude](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview).
