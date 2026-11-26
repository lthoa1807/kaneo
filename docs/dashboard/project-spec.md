# Kaneo Dashboard – Project Specification

| Field | Value |
| --- | --- |
| Status | Approved initial specification (source of truth for the initiative) |
| Version | 1.0 |
| Date | 2026-11-26 |
| Development branch | `feature/ui-development` |
| Current phase | Phase 5 – Dashboard Widgets and Integration (implementation landed; widget tests and Phase 6 gates outstanding) |

This document governs the entire Dashboard initiative. It is the input to
Phase 0 and must not be changed silently. Any requirement change follows
section 5.6 below.

---

## 1. Project Overview

### 1.1. Background

Kaneo is an open-source project management platform that provides workspace management, project management, task tracking, REST API and MCP integration.

The objective of this initiative is to extend Kaneo with an additional Dashboard experience, providing users with a centralized view of project activities, task statistics, workspace performance and other relevant operational information.

The Dashboard should improve visibility into project progress and help users understand the overall status of their work without having to navigate through multiple projects and task lists.

### 1.2. Project Objectives

The primary objectives are:

1. Provide a centralized Dashboard within Kaneo.
2. Visualize project and task information using meaningful statistics and charts.
3. Allow users to monitor multiple projects within their accessible Workspace.
4. Reuse Kaneo's existing authentication, authorization, data model and UI architecture wherever possible.
5. Maintain compatibility with the existing Kaneo application.
6. Establish an architecture that supports future Dashboard features and AI-powered analytics.
7. Minimize unnecessary changes to Kaneo's existing core functionality.

### 1.3. Guiding Principles

The implementation must follow these principles:

- **Reuse First:** Prefer existing Kaneo components, services, APIs and dependencies.
- **Data Accuracy:** All production metrics must be calculated from actual Kaneo data.
- **No Invented Data:** Never fabricate API capabilities, business metrics or production data.
- **Incremental Development:** Implement the project through clearly defined phases.
- **Human Approval:** Require explicit approval before proceeding to the next phase.
- **Maintainability:** Follow existing Kaneo coding conventions and architecture.
- **Minimal Impact:** Avoid unnecessary modifications to existing Kaneo functionality.
- **Performance:** Ensure Dashboard data retrieval and rendering remain efficient.
- **Security:** Respect existing authentication and authorization boundaries.

---

## 2. Scope

### 2.1. In Scope

The project may include:

- Dashboard navigation and routing.
- Dashboard layout and UI components.
- Workspace-level overview.
- Project statistics.
- Task statistics.
- Task status distribution.
- Project progress visualization.
- Member-related statistics, where supported by available data.
- Time tracking analytics, where supported by available data.
- Filtering by Workspace, Project and time period.
- Responsive Dashboard layout.
- Integration with existing Kaneo REST APIs.
- Optional AI-powered analytics through MCP.

### 2.2. Out of Scope

Unless explicitly approved, the following are excluded:

- Replacing Kaneo's existing project management functionality.
- Rebuilding the existing UI system.
- Introducing an independent authentication system.
- Replacing the existing database architecture.
- Unnecessary database schema changes.
- Introducing a separate analytics infrastructure.
- Modifying existing business rules.
- Implementing metrics that cannot be reliably calculated from available data.

### 2.3. Scope Control

The scope defined in this document is an initial direction, not a commitment to implement every listed feature.

The actual implementation scope must be finalized after Technical Discovery.

Features that require unavailable data or unsupported business capabilities must be documented as limitations rather than implemented using fabricated data.

---

## 3. Technical Constraints

### 3.1. Existing Kaneo Architecture

The existing Kaneo architecture is the primary technical reference.

Before implementation, the Agent must inspect:

- Repository structure.
- Frontend framework.
- Backend architecture.
- Existing UI component library.
- Styling and theme system.
- Routing architecture.
- API structure.
- Authentication and authorization.
- Database schema.
- Existing testing infrastructure.

Do not assume the technology stack or architectural details without inspecting the source code.

### 3.2. UI and Design Tools

Evaluate the following repositories:

**Astryx**
https://github.com/meta/astryx

Purpose:
- UI component library.
- Accessibility patterns.
- Theme and styling capabilities.
- Data-oriented UI components.

Adoption policy:
- Prefer existing Kaneo components.
- Evaluate Astryx compatibility before installation.
- Do not introduce a second styling system without justification.
- Use only components that provide clear benefits.

**Hallmark**
https://github.com/nutlope/hallmark

Purpose:
- Design guidance.
- UI quality evaluation.
- Visual consistency.
- Detection of generic AI-generated interface patterns.

Adoption policy:
- Use as a design and quality-assurance aid.
- Follow an approved Design Specification.
- Do not allow automatic redesigns to override approved design decisions.

**Modern Web Guidance**
https://github.com/GoogleChrome/modern-web-guidance-src

Purpose:
- Modern browser development practices.
- Rendering optimization.
- Performance guidance.
- Responsive layout techniques.

Adoption policy:
- Apply recommendations selectively.
- Prioritize measurable performance improvements.
- Avoid introducing complexity without demonstrated benefits.

### 3.3. Data Integration

REST API is the primary integration mechanism for Dashboard UI.

MCP is optional and intended primarily for AI-related capabilities.

The Agent must:

- Inspect existing API endpoints.
- Reuse existing business logic.
- Identify missing data capabilities.
- Avoid duplicating backend calculations unnecessarily.
- Follow existing API authentication and authorization.
- Avoid exposing sensitive information to the frontend.

Do not assume an API exists until verified.

### 3.4. Development Environment

Orca is the primary Agent Development Environment.

Git Worktree may be used to isolate development tasks.

However, the project must follow sequential execution rather than concurrent implementation by multiple Agents.

One primary implementation Agent should be responsible for the active phase.

---

## 4. Execution Strategy

The project must be implemented through the following phases.

Each phase has:

1. Objectives.
2. Tasks.
3. Expected deliverables.
4. Acceptance criteria.
5. Approval requirements.

The Agent must stop after completing each phase.

The next phase can only begin after explicit human approval.

### Phase 0 – Technical Discovery

**Objective:** Understand the existing Kaneo architecture and identify the safest implementation approach.

Tasks:

1. Inspect the repository structure.
2. Identify frontend and backend technologies.
3. Inspect existing UI components.
4. Inspect routing and navigation.
5. Inspect REST APIs.
6. Inspect MCP capabilities.
7. Inspect relevant database entities.
8. Review authentication and authorization.
9. Evaluate compatibility with Astryx.
10. Evaluate Hallmark and Modern Web Guidance.
11. Identify potential integration points.
12. Identify technical risks and limitations.

Restrictions:

- Read-only investigation.
- No source code changes.
- No dependency installation.
- No database changes.

Deliverable:

`docs/dashboard/technical-assessment.md`

Acceptance criteria:

- Current architecture is accurately documented.
- Relevant API capabilities are verified.
- Existing UI components are identified.
- Dashboard integration options are evaluated.
- Technical risks are documented.
- Recommendations are supported by repository evidence.

**Approval Gate 0:** Human reviews and approves the Technical Assessment.

---

### Phase 1 – Architecture and Functional Specification

**Objective:** Define the Dashboard architecture and functional requirements.

Tasks:

1. Define Dashboard integration architecture.
2. Define routing and navigation.
3. Define component architecture.
4. Define Dashboard data flow.
5. Define API contracts.
6. Define data aggregation responsibilities.
7. Define metric calculation rules.
8. Define authentication and authorization requirements.
9. Define caching strategy.
10. Define error handling.
11. Define testing strategy.
12. Define implementation boundaries.

Deliverables:

- `docs/dashboard/architecture.md`
- `docs/dashboard/functional-spec.md`
- `docs/dashboard/data-model.md`
- `docs/dashboard/api-contract.md`
- `docs/dashboard/implementation-plan.md`

Acceptance criteria:

- Architecture is consistent with Kaneo.
- Every proposed metric has a clear definition.
- Data sources are identified.
- API contracts are documented.
- Security requirements are defined.
- Implementation tasks are sufficiently detailed.

**Approval Gate 1:** Human approves architecture and functional specifications.

---

### Phase 2 – UI/UX Design and Prototype

**Objective:** Establish the visual design and user experience before implementing production functionality.

Tasks:

1. Analyze Kaneo's existing visual language.
2. Define Dashboard layout.
3. Define navigation structure.
4. Define typography and spacing.
5. Define color and theme usage.
6. Define Dashboard widgets.
7. Define responsive behavior.
8. Evaluate reusable UI components.
9. Build a functional prototype.
10. Review the prototype using Orca Browser.
11. Evaluate the result using Hallmark where applicable.

The prototype may use fixture data.

Mock data must remain clearly separated from production data integration.

Deliverables:

- `docs/dashboard/design-spec.md`
- Dashboard prototype.
- Component inventory.
- Responsive screenshots.
- Design review report.

Acceptance criteria:

- Visual design is approved.
- Layout is consistent with Kaneo.
- Existing themes are supported.
- Responsive behavior is verified.
- Component reuse strategy is documented.

**Approval Gate 2:** Human approves UI/UX and prototype.

---

### Phase 3 – Dashboard Foundation

**Objective:** Implement the technical foundation of the Dashboard.

Tasks:

1. Create Dashboard routes.
2. Integrate Dashboard navigation.
3. Implement Dashboard layout.
4. Implement reusable Dashboard components.
5. Integrate the existing theme system.
6. Implement loading states.
7. Implement error states.
8. Implement empty states.
9. Establish component and module boundaries.
10. Add initial tests.

Use fixture data where necessary.

Do not implement all production data integrations in this phase.

Deliverables:

- Dashboard foundation.
- Reusable layout components.
- Routing integration.
- Initial automated tests.

Acceptance criteria:

- Dashboard is accessible through Kaneo navigation.
- Existing Kaneo functionality remains intact.
- Layout and themes work correctly.
- Responsive behavior is functional.
- Build and relevant tests pass.

**Approval Gate 3:** Human reviews and approves the Dashboard foundation.

---

### Phase 4 – Dashboard Data Layer

**Objective:** Implement reliable integration with real Kaneo data.

Implement incrementally:

1. Workspace Summary.
2. Project Statistics.
3. Task Statistics.
4. Task Distribution.
5. Member Statistics.
6. Time Tracking Analytics.

For each data domain:

- Verify the source API.
- Define or confirm the data contract.
- Implement the service.
- Implement data transformation.
- Implement hooks or equivalent state integration.
- Handle pagination.
- Handle errors.
- Handle loading and empty states.
- Verify authorization.
- Test calculation accuracy.

Do not implement unsupported metrics.

Deliverables:

- Dashboard data services.
- Data contracts.
- Automated tests.
- Data validation report.

Acceptance criteria:

- Production data comes from actual Kaneo sources.
- Calculations follow approved business definitions.
- No fabricated production data exists.
- Access permissions are respected.
- Data errors are handled correctly.

**Approval Gate 4:** Human approves the Data Layer.

---

### Phase 5 – Dashboard Widgets and Integration

**Objective:** Connect real data to the approved Dashboard UI.

Tasks:

1. Integrate Workspace Overview.
2. Integrate Project Overview.
3. Integrate Task Statistics.
4. Integrate Task Distribution.
5. Integrate Activity information where supported.
6. Integrate Time Tracking where supported.
7. Implement approved filters.
8. Implement interactions and navigation.
9. Verify responsive behavior.
10. Remove prototype fixtures from production paths.

Implement and review widgets incrementally.

Deliverables:

- Fully integrated Dashboard.
- Widget-level tests.
- Integration test results.

Acceptance criteria:

- Widgets display real data.
- Displayed values match their source.
- Filters work correctly.
- Loading, error and empty states work.
- No prototype data leaks into production.

**Approval Gate 5:** Human approves the integrated Dashboard.

---

### Phase 6 – Quality Assurance and Optimization

**Objective:** Ensure the Dashboard is stable, secure, accessible and performant.

Testing areas:

**Functional Testing**
- Navigation.
- Workspace selection.
- Project filtering.
- Date filtering.
- Data consistency.
- Authentication.
- Authorization.

**Visual Testing**
- Desktop.
- Tablet.
- Mobile.
- Light mode.
- Dark mode.
- Component consistency.

**Performance Testing**
- Initial rendering.
- API response time.
- Data loading.
- Bundle size.
- LCP.
- INP.
- CLS.

**Regression Testing**
- Existing Kaneo functionality.
- Existing routes.
- Existing UI components.
- Existing API behavior.

Tools:

- Playwright.
- Orca Browser.
- Hallmark Sloplint.
- Lighthouse.
- Modern Web Guidance.

Deliverables:

- `docs/dashboard/test-report.md`
- `docs/dashboard/performance-report.md`
- `docs/dashboard/final-review.md`

Acceptance criteria:

- Relevant automated tests pass.
- No critical functional defects remain.
- No authorization vulnerabilities are identified.
- No critical responsive issues remain.
- Performance findings are documented.
- Existing Kaneo functionality remains stable.

**Approval Gate 6:** Human approves final implementation.

---

## 5. Agent Execution Rules

These rules apply throughout the project.

### 5.1. Sequential Execution

- Execute phases in the defined order.
- Only one primary implementation Agent at a time.
- Do not run multiple implementation worktrees concurrently.
- Do not automatically start the next phase.
- Wait for explicit human approval.

### 5.2. Scope Control

- Work only within the approved phase scope.
- Do not introduce unrelated improvements.
- Do not refactor unrelated Kaneo modules.
- Do not change existing business logic without approval.
- Report scope changes before implementing them.

### 5.3. Technical Decisions

For every significant technical decision:

1. Explain the problem.
2. Present available options.
3. Describe trade-offs.
4. Recommend an approach.
5. Wait for approval when the decision affects architecture, security, data structures or dependencies.

### 5.4. Code Quality

- Follow existing Kaneo conventions.
- Prefer existing dependencies.
- Avoid unnecessary abstractions.
- Avoid duplicated business logic.
- Add tests for new functionality.
- Keep changes focused and reviewable.

### 5.5. Git Management

- Use a dedicated development branch.
- Keep commits logically separated.
- Do not merge into the main branch automatically.
- Do not force-push.
- Do not discard existing user changes.
- Report modified files and commit hashes after each implementation phase.

### 5.6. Documentation

Update relevant documentation after each phase.

Do not silently change previously approved specifications.

If a requirement must change:

1. Explain why.
2. Identify the affected documents.
3. Describe the impact.
4. Request approval.
5. Update the specification after approval.

---

## 6. Phase Completion Report

At the end of every phase, provide a report using this structure:

### Phase Summary

- Phase:
- Status:
- Objectives completed:
- Objectives not completed:

### Implementation / Investigation Details

- Work performed.
- Important findings.
- Technical decisions.
- Files created or modified.

### Testing and Validation

- Tests executed.
- Test results.
- Build results.
- Known issues.

### Risks and Limitations

- Unresolved issues.
- Dependencies.
- Technical risks.
- Required decisions.

### Next Phase

- Proposed next phase.
- Prerequisites.
- Outstanding approval items.

### Approval Status

The Agent must explicitly state:

`WAITING FOR HUMAN APPROVAL`

Do not proceed automatically.

---

## 7. Final Success Criteria

The project is considered successful when:

1. Dashboard is integrated into Kaneo.
2. Dashboard provides useful workspace and project visibility.
3. Statistics are calculated from actual data.
4. Existing authentication and authorization are respected.
5. Existing Kaneo functionality remains stable.
6. UI is consistent with the existing application.
7. Dashboard works across supported screen sizes.
8. Automated tests cover critical functionality.
9. Performance is acceptable.
10. Implementation is maintainable and documented.
11. Future extensions can be added without major architectural changes.

---

## 8. Initial Instruction to the Agent

Start with Phase 0 – Technical Discovery only.

Read this specification completely before starting.

Do not implement any code.

Do not install dependencies.

Do not begin Phase 1 automatically.

Your first task is to inspect the existing Kaneo repository and produce:

`docs/dashboard/technical-assessment.md`

After completing Phase 0:

1. Summarize your findings.
2. List technical risks.
3. Present your recommendations.
4. Identify unresolved questions.
5. Report all files created or modified.
6. Stop and wait for explicit human approval.

This specification governs the entire Dashboard initiative.

Human approval is mandatory before moving between phases.
