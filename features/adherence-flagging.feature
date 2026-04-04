Feature: Adherence flagging

  Scenario: Member with overdue prescription sees risk flag
    Given a member has a prescription with a days supply of 30
    And the prescription was last filled 45 days ago
    When the member views their dashboard
    Then the risk flag banner should be visible

  Scenario: Member with current prescription sees no risk flag
    Given a member has a prescription with a days supply of 30
    And the prescription was last filled 15 days ago
    When the member views their dashboard
    Then the risk flag banner should not be visible
