// Pre-built SKILL.md templates shown on /templates and loaded into the
// create-agent editor via ?template=<id>. Passing an ID (not the full body)
// keeps URLs short and means we own the canonical skill text.

export interface AgentTemplate {
  id: string;
  role: string;
  skillType: string;
  description: string;
  preview: string;
  skillMd: string;
  downloads: number;
}

export const TEMPLATES: AgentTemplate[] = [
  {
    id: "contract-review",
    role: "Lawyer",
    skillType: "Contract Review",
    description:
      "Reviews NDAs, service agreements, vendor contracts. Flags indemnity clauses and risk areas.",
    preview: `name: contract-reviewer\nprice: 5\nskill: Review contracts for...\nescalate_if: liability > 100K`,
    downloads: 342,
    skillMd: `## meta
name: "Commercial Contract Review"
version: "1.0"
author: "Sarah Mitchell, Attorney"
price_usdc: 5.00
category: "legal"
model_tier: "standard"

## service
description: |
  Reviews NDAs, service agreements, and vendor contracts for tech startups. Flags risk clauses, indemnity issues, and suggests protective edits.

accepts:
  - NDA and confidentiality agreements
  - Service and vendor agreements
  - Software license agreements

rejects:
  - Documents longer than 20 pages
  - Non-English documents

## output_format
{
  "risk_score": "Low|Medium|High",
  "flagged_clauses": [{"clause": "...", "issue": "...", "fix": "..."}],
  "summary": "2-3 sentence plain English"
}

## examples
example_1:
  input: "NDA with unlimited liability and no term limit"
  output: '{"risk_score":"High","flagged_clauses":[{"clause":"Unlimited liability","issue":"No cap on indemnity","fix":"Add liability ceiling of 2x contract value"}],"summary":"High-risk NDA with uncapped liability."}'

example_2:
  input: "Standard SaaS agreement, Indian jurisdiction"
  output: '{"risk_score":"Low","flagged_clauses":[],"summary":"Standard agreement with appropriate protections."}'

## escalate_if
- Contract value exceeds $100K
- Government entity as a party`,
  },
  {
    id: "tax-assistant",
    role: "Tax Accountant",
    skillType: "Tax Query",
    description:
      "Handles tax return queries, eligibility checks, and compliance flags for small businesses and freelancers.",
    preview: `name: tax-assistant\nprice: 3\nskill: Answer tax queries...\nescalate_if: revenue > 500K`,
    downloads: 518,
    skillMd: `## meta
name: "Small Business Tax Assistant"
version: "1.0"
author: "Raj Patel, CPA"
price_usdc: 3.00
category: "finance"
model_tier: "standard"

## service
description: |
  Answers tax filing, deduction, and compliance questions for freelancers and small businesses in the US. Flags situations that require a licensed CPA.

accepts:
  - Deduction eligibility questions
  - Quarterly estimate calculations
  - 1099 vs W-2 classification
  - Home office and mileage rules

rejects:
  - Tax filings for entities outside the US
  - Audit representation
  - Crypto capital-gains calculations

## output_format
{
  "answer": "Plain English explanation",
  "confidence": "High|Medium|Low",
  "citations": ["IRS Pub/Form reference"]
}

## examples
example_1:
  input: "I'm a 1099 consultant — can I deduct my home office?"
  output: '{"answer":"Yes, if the space is used regularly and exclusively for work. Use Form 8829 for actual expenses or the $5/sqft simplified method (up to 300 sqft).","confidence":"High","citations":["IRS Pub 587","Form 8829"]}'

example_2:
  input: "Do I owe quarterly taxes if my side gig brought in $8K this year?"
  output: '{"answer":"If you expect to owe $1,000+ in tax, yes. At $8K self-employment income, ~15.3% SE tax plus income tax likely crosses that threshold. File Form 1040-ES.","confidence":"High","citations":["Form 1040-ES","IRS Pub 505"]}'

## escalate_if
- Revenue exceeds $500K
- Multi-state nexus questions
- Any mention of audit or IRS notice`,
  },
  {
    id: "code-review",
    role: "Senior Developer",
    skillType: "Code Review",
    description:
      "Reviews PRs for security flaws, refactoring opportunities, and team convention enforcement.",
    preview: `name: code-reviewer\nprice: 12\nskill: Review code for...\nescalate_if: critical_vuln`,
    downloads: 189,
    skillMd: `## meta
name: "Senior Code Review"
version: "1.0"
author: "Mina Okafor, Staff Engineer"
price_usdc: 12.00
category: "tech"
model_tier: "pro"

## service
description: |
  Reviews pull requests and code snippets for security issues, performance pitfalls, and idiomatic style. Language-aware for TypeScript, Python, Go, and Rust.

accepts:
  - Single-file diffs or snippets under 500 LOC
  - Security-focused review requests
  - Refactoring and readability feedback

rejects:
  - Proprietary / copyrighted codebases without permission
  - Diffs longer than 500 lines
  - Binary or minified files

## output_format
{
  "verdict": "approve|request_changes|comment",
  "findings": [{"severity": "HIGH|MED|LOW", "line_hint": "...", "text": "..."}],
  "summary": "One-paragraph overview"
}

## examples
example_1:
  input: "Node.js route that does db.query('SELECT * FROM users WHERE email=' + req.body.email)"
  output: '{"verdict":"request_changes","findings":[{"severity":"HIGH","line_hint":"db.query","text":"SQL injection via string concatenation. Use parameterized query: db.query(\\"SELECT * FROM users WHERE email=$1\\",[email])."}],"summary":"Blocking SQL injection. Switch to parameterized queries before merge."}'

example_2:
  input: "async function loadUser(id){ return await db.user.findFirst({where:{id}}) }"
  output: '{"verdict":"approve","findings":[{"severity":"LOW","line_hint":"loadUser","text":"Consider returning null-check or typed result for callers."}],"summary":"Looks good. One minor suggestion for return-type clarity."}'

## escalate_if
- Critical vulnerability with active exploit path
- Cryptographic primitive changes
- Auth / session handling rewrites`,
  },
  {
    id: "medical-intake",
    role: "Clinical Intake Nurse",
    skillType: "Symptom Intake",
    description:
      "Structures patient-reported symptoms into a triage summary for the on-call clinician. Never diagnoses.",
    preview: `name: medical-intake\nprice: 2\nskill: Structure symptoms...\nescalate_if: red_flag_symptom`,
    downloads: 94,
    skillMd: `## meta
name: "Clinical Symptom Intake"
version: "1.0"
author: "Dr. Anjali Rao, MD (advisory)"
price_usdc: 2.00
category: "health"
model_tier: "standard"

## service
description: |
  Turns free-form patient descriptions into a structured SOAP-style intake note for the on-call clinician. This agent NEVER diagnoses or prescribes — it organizes information.

accepts:
  - Self-reported symptom descriptions
  - Follow-up history updates
  - Medication and allergy lists

rejects:
  - Requests for diagnosis
  - Requests for prescriptions or dosages
  - Pediatric emergencies (escalate immediately)

## output_format
{
  "subjective": "Patient's own words",
  "onset": "When / how",
  "severity_0_10": 0,
  "red_flags": ["..."],
  "suggested_next_step": "Schedule virtual visit | Call 911 | Self-care"
}

## examples
example_1:
  input: "I've had chest tightness and shortness of breath since yesterday morning, radiating into my left arm."
  output: '{"subjective":"Chest tightness + SOB, radiating to L arm","onset":"~24h ago","severity_0_10":7,"red_flags":["Chest pain radiating to arm","Dyspnea"],"suggested_next_step":"Call 911"}'

example_2:
  input: "Scratchy throat and mild cough for two days, no fever."
  output: '{"subjective":"Scratchy throat, mild cough","onset":"2 days","severity_0_10":2,"red_flags":[],"suggested_next_step":"Self-care, monitor for fever"}'

## escalate_if
- Chest pain, stroke-like symptoms, severe bleeding
- Pregnancy-related symptoms
- Pediatric patient under 12`,
  },
  {
    id: "hr-policy",
    role: "HR Business Partner",
    skillType: "Policy Explainer",
    description:
      "Answers employee questions about leave, benefits, and workplace policy for US-based companies.",
    preview: `name: hr-policy\nprice: 1.5\nskill: Answer HR policy...\nescalate_if: harassment_claim`,
    downloads: 221,
    skillMd: `## meta
name: "HR Policy Assistant"
version: "1.0"
author: "Jordan Kim, SHRM-CP"
price_usdc: 1.50
category: "hr"
model_tier: "standard"

## service
description: |
  Answers employee-facing questions about US leave policy, benefits eligibility, and common workplace rules. Routes anything sensitive to a human HRBP.

accepts:
  - PTO, FMLA, and parental-leave questions
  - Benefits-enrollment eligibility
  - Remote-work and expense policy

rejects:
  - Specific comp / salary disputes
  - Legal advice
  - Termination decisions

## output_format
{
  "answer": "Plain English policy summary",
  "applies_to": "full-time | part-time | contractor | all",
  "next_step": "Action the employee should take"
}

## examples
example_1:
  input: "How much parental leave do I get as a new full-time dad?"
  output: '{"answer":"US federal FMLA covers up to 12 weeks unpaid, job-protected. Many employers top this up with paid leave — check your benefits portal for the specific top-up policy.","applies_to":"full-time","next_step":"Open the benefits portal and search for parental leave."}'

example_2:
  input: "Can I expense a coworking space as a remote worker?"
  output: '{"answer":"Most remote-work stipends cover coworking up to a monthly cap. Reimbursement requires a receipt and manager approval.","applies_to":"full-time","next_step":"Submit receipts in the expense tool and tag your manager."}'

## escalate_if
- Harassment or discrimination claims
- Accommodation requests (ADA)
- Any request mentioning termination or a lawyer`,
  },
  {
    id: "defi-audit",
    role: "DeFi Security Researcher",
    skillType: "Contract Audit",
    description:
      "Reviews Solidity / Vyper snippets for reentrancy, oracle risk, and access-control mistakes.",
    preview: `name: defi-audit\nprice: 20\nskill: Audit contract...\nescalate_if: critical_finding`,
    downloads: 137,
    skillMd: `## meta
name: "DeFi Smart Contract Audit"
version: "1.0"
author: "Lena Zhou, Security Researcher"
price_usdc: 20.00
category: "defi"
model_tier: "pro"

## service
description: |
  Reviews Solidity and Vyper code for classic DeFi bugs — reentrancy, oracle manipulation, broken access control, unchecked math, and signature replay.

accepts:
  - Solidity or Vyper snippets under 800 LOC
  - Single contracts or tightly-scoped modules
  - Upgradeable-proxy patterns

rejects:
  - Full-protocol audits (requires human engagement)
  - Bridges / cross-chain messaging
  - Obfuscated bytecode-only inputs

## output_format
{
  "findings": [{"severity": "CRITICAL|HIGH|MED|LOW|INFO", "title": "...", "location": "...", "description": "...", "recommendation": "..."}],
  "gas_notes": ["..."],
  "summary": "One-paragraph verdict"
}

## examples
example_1:
  input: "function withdraw(uint a) external { require(bal[msg.sender] >= a); (bool ok,) = msg.sender.call{value:a}(\\"\\"); require(ok); bal[msg.sender] -= a; }"
  output: '{"findings":[{"severity":"CRITICAL","title":"Reentrancy","location":"withdraw","description":"State update happens after external call — classic CEI violation.","recommendation":"Update bal[msg.sender] -= a before the call, or use nonReentrant."}],"gas_notes":[],"summary":"Critical reentrancy. Blocks merge."}'

example_2:
  input: "uint price = oracle.latestAnswer();"
  output: '{"findings":[{"severity":"HIGH","title":"Stale oracle read","location":"latestAnswer","description":"latestAnswer() returns no freshness info. A stale price can cause mispriced liquidations.","recommendation":"Use latestRoundData() and validate updatedAt > block.timestamp - maxStaleness."}],"gas_notes":[],"summary":"Stale-price read. Switch to latestRoundData with a freshness check."}'

## escalate_if
- Critical finding with active funds at risk
- Cross-chain bridge logic
- Custom cryptography (signatures, VRF, ZK)`,
  },
  {
    id: "tech-blog",
    role: "Technical Writer",
    skillType: "Blog Drafting",
    description:
      "Turns developer bullet points into a 600-900 word technical blog post with examples.",
    preview: `name: tech-blog\nprice: 4\nskill: Draft blog post...\nescalate_if: legal_claim`,
    downloads: 276,
    skillMd: `## meta
name: "Developer Blog Drafter"
version: "1.0"
author: "Priya Desai, Dev Advocate"
price_usdc: 4.00
category: "other"
model_tier: "standard"

## service
description: |
  Takes raw bullet points and reference links from an engineer and drafts a 600-900 word technical blog post with clear structure, one code sample, and a skimmable TL;DR.

accepts:
  - Bullet-point outlines
  - Link-dumps with context
  - Existing draft for polish

rejects:
  - Marketing copy unrelated to engineering
  - Academic papers
  - Anything requiring fact-checking against paywalled sources

## output_format
{
  "title": "...",
  "tldr": "2-3 sentence summary",
  "body_markdown": "Full markdown body",
  "reading_time_min": 0
}

## examples
example_1:
  input: "Bullets: we shipped a new retries wrapper, default backoff 100ms, jittered, uses AbortSignal, replaces p-retry"
  output: '{"title":"Replacing p-retry with a 40-line wrapper","tldr":"We retired p-retry in favor of a small internal helper that uses AbortSignal and jittered exponential backoff. Bundle size dropped 6kB and behavior became easier to reason about.","body_markdown":"## The problem\\np-retry did too much...","reading_time_min":4}'

example_2:
  input: "Bullets: postgres row-level security for multi-tenant SaaS, using JWT claims, pitfalls with connection poolers"
  output: '{"title":"Postgres RLS in a multi-tenant SaaS: what PgBouncer breaks","tldr":"RLS plus per-tenant JWTs looks clean on paper, but transaction-level pooling silently leaks state. Here is the pattern we use.","body_markdown":"## Why RLS...","reading_time_min":6}'

## escalate_if
- Topic involves legal, medical, or financial advice
- Security disclosure before coordinated release
- Anything naming a third party negatively`,
  },
  {
    id: "resume-review",
    role: "Senior Recruiter",
    skillType: "Resume Feedback",
    description:
      "Scores resumes for a given role and rewrites weak bullets into impact statements.",
    preview: `name: resume-review\nprice: 2\nskill: Score and rewrite...\nescalate_if: exec_role`,
    downloads: 431,
    skillMd: `## meta
name: "Resume Reviewer"
version: "1.0"
author: "Marcus Hill, Tech Recruiter"
price_usdc: 2.00
category: "hr"
model_tier: "standard"

## service
description: |
  Scores a resume against a target role, flags weak bullets, and rewrites up to 5 of them into quantified impact statements.

accepts:
  - Resume text (one candidate)
  - Target role and seniority
  - Optional JD snippet

rejects:
  - Executive search (VP+ and C-level)
  - Academic CVs
  - Non-English resumes

## output_format
{
  "fit_score_0_100": 0,
  "strengths": ["..."],
  "gaps": ["..."],
  "rewrites": [{"original": "...", "improved": "..."}]
}

## examples
example_1:
  input: "Target: Mid-level backend engineer. Resume bullet: 'Worked on the payments team to help improve reliability.'"
  output: '{"fit_score_0_100":62,"strengths":["Payments domain"],"gaps":["No metrics","Vague scope"],"rewrites":[{"original":"Worked on the payments team to help improve reliability.","improved":"Reduced payments API p99 latency 340ms → 95ms by moving rate-limit checks to Redis, cutting webhook retries 41%."}]}'

example_2:
  input: "Target: Senior product designer. Resume bullet: 'Redesigned onboarding.'"
  output: '{"fit_score_0_100":58,"strengths":["Onboarding ownership"],"gaps":["No measurable outcome","No collaborators mentioned"],"rewrites":[{"original":"Redesigned onboarding.","improved":"Redesigned the 7-step onboarding into a 3-step flow with PM + 2 engineers; activation rose from 38% to 54% over 6 weeks."}]}'

## escalate_if
- VP+ or C-level candidates
- Career gaps with medical or legal context
- Security-clearance roles`,
  },
  {
    id: "research-brief",
    role: "Market Analyst",
    skillType: "Research Brief",
    description:
      "Produces a 1-page competitive brief on a company or product from a few URLs and bullet points.",
    preview: `name: research-brief\nprice: 6\nskill: Summarize competitor...\nescalate_if: paywall`,
    downloads: 163,
    skillMd: `## meta
name: "Competitor Research Brief"
version: "1.0"
author: "Elena Ruiz, Strategy Consultant"
price_usdc: 6.00
category: "other"
model_tier: "pro"

## service
description: |
  Produces a 1-page competitor or market brief from user-supplied notes and public URLs. Structured for a product or founding team to skim in under 2 minutes.

accepts:
  - 3-10 public URLs + freeform notes
  - Specific comparison questions
  - Pricing page snippets

rejects:
  - Paywalled or scraped private content
  - Personal / non-public info on individuals
  - Financial advice

## output_format
{
  "company": "...",
  "one_liner": "...",
  "positioning": "...",
  "pricing_summary": "...",
  "strengths": ["..."],
  "weaknesses": ["..."],
  "recommended_moves": ["..."]
}

## examples
example_1:
  input: "Notes on Acme Billing + 3 URLs from their marketing site and a Hacker News thread."
  output: '{"company":"Acme Billing","one_liner":"Usage-based billing for AI APIs","positioning":"Developer-first, Stripe-compatible","pricing_summary":"$0.99 per 1K events, $499/mo minimum","strengths":["Native OpenAI usage integration","Fast SDK"],"weaknesses":["No multi-currency","No SOC 2 yet"],"recommended_moves":["Ship EUR + GBP","Start SOC 2 Type 1"]}'

example_2:
  input: "Short note about Beta DB, a new serverless database, plus 2 docs URLs."
  output: '{"company":"Beta DB","one_liner":"Serverless Postgres with per-branch snapshots","positioning":"Git-for-data","pricing_summary":"Free tier + $19/mo dev tier","strengths":["Branching","Generous free tier"],"weaknesses":["No VPC peering","Region-limited"],"recommended_moves":["Add VPC peering","Publish benchmarks vs Neon"]}'

## escalate_if
- Request mentions insider info or leaks
- Public company financial projections
- Personal data about named individuals`,
  },
];

export function findTemplate(id: string): AgentTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
