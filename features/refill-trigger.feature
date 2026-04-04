Feature: Refill trigger

  Scenario: Overdue prescription triggers a refill request
    Given a member has a prescription with a refill status of "overdue"
    When a refill is requested for that prescription
    Then the prescription status should update to "ok"
