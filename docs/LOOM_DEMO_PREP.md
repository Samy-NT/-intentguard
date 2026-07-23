# Loom Prep - Aurel

## Important positioning fix

The current product in this repository is not a partnership/opportunity CRM. It is Aurel, a runtime intent firewall for agentic payments.

For the Loom, use this tighter framing:

> Aurel sits between an AI agent and the payment rail. Before a transaction executes, it checks the payment intent across deterministic rules, velocity controls, and semantic analysis to decide whether to allow, flag, or block it.

## Recommended Demo Flow

### 0:00-0:15 - Intro

**Voiceover**
Hi, I'm Adam, co-founder of Aurel. Thanks for taking the time to review the project. In this short video, I'll show the problem we are solving, how Aurel evaluates agentic payments in real time, and the kind of pilot we would like to explore.

**Screen**
Start on the landing page. Keep the hero and "Runtime intent firewall" message visible.

### 0:15-0:45 - Problem

**Voiceover**
As companies start using AI agents to automate operations, one of the most sensitive workflows is payment execution. An agent might receive a legitimate invoice, but it can also be exposed to injected instructions, manipulated context, suspicious recipients, or payments that drift outside its intended mission. Traditional payment controls are often too static to understand the intent behind the transaction.

**Screen**
Scroll slowly to the section that explains the three layers or keep the hero with the API example visible.

### 0:45-1:10 - Solution

**Voiceover**
Aurel acts as an intelligent control layer before money moves. Every payment intent is evaluated through deterministic rules, velocity checks, and semantic analysis. The result is a clear decision: allow safe payments, flag uncertain ones for review, and block high-risk transactions before execution.

**Screen**
Move to the interactive demo console.

### 1:10-2:30 - Product Demo

**Voiceover**
Here is the Aurel demo console. I can submit a payment intent from an AI expense agent, including the amount, currency, recipient, mission scope, and the agent's reasoning.

First, I will run a legitimate payment. Aurel checks the request across its three layers, then returns an allow decision with a low risk score and a full audit record.

Now I will switch to a risky scenario. In this example, the recipient or the context triggers a policy violation. Aurel does not just return a binary answer. It shows which layer was triggered, why the transaction is risky, and what evidence is stored for auditability.

This is the core value: turning opaque agent actions into controlled, explainable, reviewable payment decisions.

**Screen Actions**
1. Open `http://localhost:3000`.
2. Click or scroll to `Demo`.
3. Select the legitimate scenario.
4. Click `Verify Intent`.
5. Pause on the `ALLOW` decision and risk score.
6. Expand or point at the audit record.
7. Select a risky scenario such as denylisted recipient, high amount, or crypto transfer.
8. Click `Verify Intent`.
9. Pause on the `FLAG` or `BLOCK` decision.
10. Briefly show the triggered layer and reason.

### 2:30-3:05 - Dashboard And Operations

**Voiceover**
Beyond the live decision, Aurel is designed for operational control. Teams can review verification logs, understand blocked or flagged transactions, manage workspace policies, and control API access. That makes the system usable not only by developers, but also by security, finance, and operations teams.

**Screen Actions**
1. Open `/dashboard` if local data is available.
2. If logs require an API key, show the navigation and explain the intended workflow.
3. Open `/dashboard/settings` to show policy controls.
4. Open `/dashboard/api-keys` to show API key management.

### 3:05-3:35 - Pilot Proposal

**Voiceover**
For an initial pilot, we would suggest a limited and measurable use case: one or two AI payment workflows, a defined set of payment policies, and a small group of users reviewing the decisions. The goal would be to measure how Aurel helps reduce risky executions, improve auditability, and give teams confidence before agentic payments scale.

**Screen**
Return to the demo decision screen or settings page.

### 3:35-3:55 - Technical And Geographic Context

**Voiceover**
Technically, Aurel can be integrated progressively through APIs or SDKs and connected to existing payment or workflow systems. We are developing the project between Morocco and France, with international use cases in mind from the start.

**Screen**
Show API example on the landing page or docs page.

### 3:55-4:10 - Close

**Voiceover**
We would be very interested in understanding whether this use case could be relevant for your team. I have also shared a short deck with additional information. Thank you again for your time, and I would be happy to discuss a potential pilot and answer any questions.

**Screen**
End on landing page hero or demo console with an `ALLOW / FLAG / BLOCK` result visible.

## Demo Scenarios To Show

Use at most two or three scenarios. More than that will feel like a feature list.

1. **Legitimate SaaS invoice**
   - Goal: show normal payment passes.
   - Expected visual: `ALLOW`, low risk, all layers pass.

2. **Denylisted recipient**
   - Goal: show deterministic rules block obvious risk quickly.
   - Expected visual: `BLOCK`, rules layer triggered.

3. **High amount or velocity pattern**
   - Goal: show uncertain transactions can be flagged for review.
   - Expected visual: `FLAG`, risk score elevated.

4. **Suspicious semantic context**
   - Goal: show Aurel catches manipulated intent, especially prompt injection or mission drift.
   - Expected visual: semantic layer triggers if Claude is configured; otherwise the deterministic pre-screen still provides useful signals.

## Recording Notes

- Record in a 16:9 browser window, ideally 1440x900 or larger.
- Zoom the browser to 90% if panels feel cramped.
- Keep the cursor still when speaking. Move only when introducing the next element.
- Pause one second after every click so Loom captures the state change.
- Do not read every field on screen. Say what the viewer should notice.
- Keep the demo section focused on two moments: one safe transaction, one risky transaction.

## Optional Visual Inserts

If you want extra B-roll between screen recordings:

1. A simple diagram: `AI agent -> Aurel -> payment rail`.
2. A before/after frame: "Opaque agent action" vs "Explainable payment decision".
3. A three-layer frame: Rules, Velocity, Semantic analysis.
4. A pilot frame: workflow, policies, users, success metrics.

