my team keeps sharing prompt files with me with diff for me to review, what is the best way to review? I feel like prompt reviewing is so subjective and probablistic.  
May 20  
Prompt review feels subjective because most teams review prompts the way they review prose — line by line, asking "does this read well?" That's the wrong frame. Prompts are behavior specifications, and behavior is empirically testable, not subjective.  
Here's how I'd reframe it:  
The diff itself is misleading. A 2-word change can flip agent behavior; a 50-line rewrite can be cosmetic. Don't review the diff first. Ask: what failing case motivated this change, and what does the eval show?  
Gate PRs on eval results, not vibes. If your team isn't attaching eval output to prompt PRs, you're doing theater. Minimum bar: the PR description should include (a) the specific call/transcript that triggered the change, (b) eval results before vs after on your golden set, (c) any regressions on adjacent test cases. Without this, the reviewer has nothing to anchor on except taste.  
The actual things to look for in the diff:

* *Instruction conflicts* — did the new line contradict something earlier in the prompt? This is the \#1 silent bug. LLMs often follow the more recent or more emphatic instruction, which may not be what the author intended.  
* *Negative instructions* — "don't say X" often anchors the model on X. Prefer positive reframes.  
* *Specificity creep* — prompts tend to accrete edge-case handling that overfits. Each new "if caller says Y, do Z" rule should justify itself.  
* *Persona drift* — for Emma/Kate/Jenny specifically, does the new text break voice consistency?  
* *Tool/transfer logic changes* — these are the highest-stakes edits because they affect routing. Should always require a call-flow trace.  
* *Token bloat with no behavior gain* — costs latency, which matters in voice.  
* *Few-shot example drift* — if you have examples in the prompt, do they still agree with the new rules?

What review can't catch. Probabilistic regressions on cases not in the eval set. The mitigation isn't better review — it's shadow deployment, A/B on live calls, and tracking metrics (transfer accuracy, intake completion rate, hallucination flags in Langfuse).  
The "subjective" feeling goes away when reviewers stop being asked "is this prompt good?" and start being asked "did this change pass the eval, and does the diff introduce a known failure mode?" Those are decidable.  
Clarifying questions:

1. Are these system prompts for the voice agents (Emma/Kate/Jenny), or other prompts in your stack (classification, summarization, post-call analysis)?  
2. Do you currently have an eval/golden set for these prompts? If yes, are PRs already gated on it or is it run manually?  
3. Where is the review happening — GitHub PRs, Langfuse prompt management, a Notion doc, something else?  
4. What's your current deploy path — direct to prod, staged, behind a flag with A/B?  
5. What's the most common type of change you're seeing — bug fixes from specific failed calls, new feature instructions, refactors, or persona/tone tweaks?  
6. Do you want me to draft a PR template / review checklist your team can adopt, or are you more looking for a mental model right now?

whats a golden set?  
May 20  
A golden set is a curated collection of test inputs paired with expected outputs (or expected behaviors) that you use to evaluate every prompt change against the same benchmark. It's the "regression test suite" equivalent for LLMs.  
Concretely, for HelloCounsel:  
A golden set for Emma might be 30-100 call scenarios, each with:

* An input (a transcript snippet, a caller utterance, or a full simulated call)  
* The expected behavior (e.g., "transfer to intake," "collect DOB then transfer," "decline politely — not a PI case")  
* Optionally, the *reason* (so you understand why this case is in the set)

The cases are "golden" because they represent behaviors you've decided are correct and non-negotiable. They typically come from:

* Real failed calls you fixed (so they never regress)  
* Edge cases you've explicitly thought through (Spanish callers, hostile callers, prank calls, callers who already have a lawyer, minors calling about a parent's case)  
* Happy paths (clean MVA intake, slip-and-fall, med mal)  
* Routing decisions (when to transfer vs handle, when to take a message)  
* Compliance must-haves (HIPAA-adjacent disclosures, no legal advice, recording disclosure where required)

How it's used:  
When someone changes the prompt, you run all golden cases through the new prompt and compare outputs to expected. The eval can be:

* *Exact match* — rare, only for structured outputs  
* *Rubric-based* — an LLM judge scores against criteria ("did Emma collect DOB before transfer? Y/N")  
* *Human review* — for nuanced behavior like tone, slower but sometimes necessary  
* *Hybrid* — LLM judge with human spot-checks

You get a score: "47/50 passed, 3 regressed." The 3 regressions tell you exactly what the prompt change broke.  
Why it matters more for voice than chat:  
Voice agents have higher stakes per failure (one bad transfer \= lost client), no retry button, and emergent behaviors that are hard to spot by reading the prompt. A golden set is how you stop relying on "let's deploy and see."  
The honest caveat:  
Golden sets are work to build and maintain. The first version is usually 10-20 cases pulled from your worst real-world failures, and it grows from there. Many startups skip this and rely on prompt-author intuition \+ production monitoring — which works until it doesn't, usually around the point where multiple people are editing the same prompt and changes start stepping on each other. Given you have Emma, Kate, and Jenny in production with clients like Bey and McCraw, you're past that threshold.  
Clarifying questions:

1. Do you want me to sketch what a starter golden set for Emma (or one specific agent) would look like — say, 15-20 representative cases with expected behaviors?  
2. Are you currently storing call transcripts somewhere queryable (Langfuse, Vapi dashboard, S3)? That's the raw material for building this.  
3. Do you have any kind of eval running today — even ad-hoc "let me test these 5 calls before pushing"?  
4. Would you prefer to run evals locally (Python script \+ your LLM judge of choice) or use a tool (Langfuse, Promptfoo, Braintrust, Vapi's own testing)?

I understand this, but I think the problem is: how do I evaluate each turn in a conversation in the golden set?  
May 20  
This is the right question, and it's where most teams hit a wall. Single-turn eval is easy ("given input X, did output Y match?"). Multi-turn is genuinely hard because turn N depends on turns 1 through N-1, and the model's response at turn 3 changes what turn 4 even looks like. You can't just replay.  
Here are the approaches, from simplest to most rigorous:  
1\. Frozen-context turn eval (the cheap one)  
For each turn in a real transcript, you replay it as: "given the conversation history up to turn N, what does the agent do at turn N?" The history is the *actual* history from the real call, not a simulated one.

* Pros: Trivial to build from existing transcripts. Each turn becomes an independent test case.  
* Cons: You're evaluating in a counterfactual world where the agent magically said the right thing in all prior turns. Catches per-turn errors but misses cascade failures.  
* Use when: Debugging specific turn-level behaviors — "does Emma always confirm callback number before transfer?"

2\. Rubric-based full-conversation eval  
You don't evaluate turns; you evaluate the whole call against a rubric. Run the new prompt against a simulated caller (another LLM playing the persona), let the conversation unfold, then judge the transcript.  
Rubric items are behaviors, not turns: "Did Emma collect DOB at some point? Did she avoid giving legal advice? Did she transfer to the right queue? Did she stay under 90s? Did she handle the interruption at 0:42 gracefully?"

* Pros: Captures emergent behavior, handles path variation (Emma can collect DOB at turn 3 or turn 5 — both fine).  
* Cons: Needs a simulated caller, which is its own prompt engineering problem. LLM judge variance is real.  
* Use when: This is your main eval. Most production voice teams settle here.

3\. Trajectory eval with branch points  
Identify the "decision points" in a call — moments where the agent must do a specific thing (route correctly, refuse to give advice, escalate). Pin those, let everything else vary. Score \= % of decision points handled correctly across the call.

* Pros: Surfaces what actually matters (routing, compliance, data collection) and ignores stylistic variation.  
* Cons: You have to label decision points, which is curation work.  
* Use when: You care about specific business outcomes more than full-transcript quality.

4\. State-based eval (the rigorous one)  
Define the call as a state machine: greeting → qualification → intake → transfer/decline. For each transition, define preconditions ("must have caller name") and postconditions ("intake state must contain DOB, injury type, date of incident"). Run the simulated call, snapshot state after each turn, assert.

* Pros: Deterministic, debuggable, catches subtle regressions.  
* Cons: Heavy upfront cost. Only worth it if your agent's behavior maps cleanly to states (which Emma's mostly does — PI intake is structured).  
* Use when: Mature stage, multiple engineers editing prompts, regressions are biting you.

5\. The "LLM-as-judge with conversation context" pattern  
You run the simulated call, then for each agent turn, ask a judge LLM: "Here's the conversation up to turn N. Here's what the agent said at turn N. Score it on \[rubric items\], conditional on the conversation state." This gives you per-turn scores you can aggregate.

* Pros: Granular, catches specific bad turns even in calls that "succeed" overall. Works with 2 above.  
* Cons: Expensive (one judge call per turn). Judge consistency matters — pin model version, use temp 0, calibrate against human labels.

The practical recommendation for HelloCounsel:  
Start with \#2 (rubric-based full-conversation), because it gives you signal fast and matches how you actually think about call quality. Layer in \#1 (frozen-context) for specific bugs you keep hitting — those become permanent regression tests. Move toward \#3 or \#4 only when \#2 stops catching the failures you care about.  
The simulated caller is the unlock. A weak simulator means useless evals. Invest there: build 5-10 caller personas (cooperative MVA caller, confused elderly caller, hostile caller, Spanish-only caller, caller already represented, prank), each with a goal and a personality, and let them drive the conversation. The simulated caller should *not* see Emma's prompt — it just plays its role.  
One subtle thing: don't try to make every turn deterministic. Voice agents have legitimate variation (the same "I understand, let me get some details" can be phrased 50 ways). Eval the *behavior class*, not the string.  
