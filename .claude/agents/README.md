# Claude Agent Personas

This directory contains specialized AI agent personas for the chess platform development. Each agent has domain expertise and a specific lens through which they evaluate code and design decisions.

## Available Agents

### 1. **Codex** - Code Reviewer
**File:** `code-reviewer.clinerules`

**Specialty:** Code quality, correctness, type safety, testing

**When to use:**
- Before merging a PR
- When you want fresh eyes on your code
- To catch edge cases you might have missed
- To get suggestions for tests

**Example invocation:**
```
@code-reviewer.clinerules Review the changes in src/websocket/GameCoordinator.ts
```

---

### 2. **Sentinel** - Security Auditor
**File:** `security-auditor.clinerules`

**Specialty:** Security vulnerabilities, exploits, attack vectors (betting, auth, game integrity)

**When to use:**
- Before touching betting/wallet logic
- When adding authentication or authorization
- Before production deploys
- When integrating external services (APIs, crypto wallets)

**Example invocation:**
```
@security-auditor.clinerules Audit the betting settlement logic in services/betting.ts
```

---

### 3. **Nexus** - Crypto Strategist
**File:** `crypto-strategist.clinerules`

**Specialty:** Betting mechanics, tokenomics, crypto wallet integration, economic sustainability

**When to use:**
- Designing betting odds calculations
- Planning crypto wallet integration
- Evaluating revenue models or incentive structures
- Making economic/game theory decisions

**Example invocation:**
```
@crypto-strategist.clinerules Should we use fixed or dynamic odds for player vs player matches?
```

---

### 4. **Atlas** - Technical Architect
**File:** `technical-architect.clinerules`

**Specialty:** System design, architecture patterns, tech stack (Bun, Drizzle, Redis, WebSocket, Event Emitters)

**When to use:**
- Designing a new feature from scratch
- Refactoring existing architecture
- Deciding where new code should live
- Planning for scale (Redis migration, etc.)

**Example invocation:**
```
@technical-architect.clinerules Design a spectator chat system that scales to 1000 viewers per game
```

---

## How to Use

### In Claude Chat (Cursor)
Reference an agent by mentioning its file:

```
@technical-architect.clinerules How should I structure the matchmaking queue?
```

### In Custom Commands
Your existing `.claude/commands/` can reference these agents. For example, update `.claude/commands/code-review.md`:

```markdown
# Code Review

@code-reviewer.clinerules

Review the current branch against main. Focus on correctness, type safety, and edge cases.
```

### Multiple Agents
You can invoke multiple agents for different perspectives:

```
@security-auditor.clinerules Check the auth flow
@technical-architect.clinerules Verify it follows our patterns
```

---

## Agent Philosophy

Each agent has a distinct personality and focus area:

| Agent | Persona | Tone | Priority | Web Search |
|-------|---------|------|----------|------------|
| **Codex** | Meticulous reviewer | Constructive, teaching | Correctness, tests | When needed for unfamiliar APIs |
| **Sentinel** | Security paranoid | Direct, cautious | Exploits, money safety | Always checks recent vulnerabilities |
| **Nexus** | Economics strategist | Analytical, long-term | Incentives, scale, sustainability | Always checks crypto/betting trends |
| **Atlas** | System architect | Pragmatic, pattern-focused | Architecture, tech stack fit | Always checks tech best practices |

### Tool Restrictions
All agents are **advisory only**:
- They can **read** code, search, and analyze
- They **cannot** commit, push, modify databases, or run destructive commands
- They **suggest** changes; you execute them
- This is guidance, not enforcement (Claude may still take action if explicitly asked)

---

## Extending This System

To add a new agent:

1. Create `.claude/agents/your-agent-name.clinerules`
2. Define:
   - **Identity** - Who they are, their expertise
   - **Role** - What they do
   - **Focus Areas** - Specific things they evaluate
   - **Approach** - How they think through problems
   - **Output Format** - How they structure responses
3. Document it in this README
4. (Optional) Create a command in `.claude/commands/` that invokes them

---

## Technical Details

### File Format
These are `.clinerules` files—plain markdown documents that define an agent's behavior, knowledge, and personality.

### Context Sharing
Agents have access to:
- The project's codebase structure (via indexed search)
- Your current working directory
- Previous conversation context (if in the same session)

Agents do **not** automatically share context across separate invocations unless explicitly provided.

---

## Example Workflow

### Scenario: Building a New Feature

1. **Design phase**
   ```
   @technical-architect.clinerules Design a friend challenge system (invite-only games)
   ```

2. **Implementation**
   ```
   [You write the code]
   ```

3. **Security check**
   ```
   @security-auditor.clinerules Review the challenge acceptance flow for exploits
   ```

4. **Code review**
   ```
   @code-reviewer.clinerules Review the entire feature branch
   ```

5. **Economic validation** (if relevant)
   ```
   @crypto-strategist.clinerules Does this challenge system create perverse incentives?
   ```

---

## Notes

- These agents are **advisory**—they suggest, they don't execute
- They work best when given specific files or features to review
- They have **no memory** between separate chat sessions
- They're most effective when you ask focused questions

---

## Feedback & Iteration

As you use these agents, refine their personas by editing their `.clinerules` files. Add project-specific knowledge, adjust their tone, or expand their focus areas based on what's most useful.
