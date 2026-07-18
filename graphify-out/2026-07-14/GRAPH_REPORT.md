# Graph Report - faculty-promotion-system  (2026-07-13)

## Corpus Check
- 100 files · ~69,140 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1045 nodes · 1947 edges · 112 communities (56 shown, 56 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 31 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2fa751b4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Dashboard Routing & Profiles
- Auth Portal Frontend (app.js)
- Supabase & Document Controller
- Backend Dependencies
- Graphify Skill Docs
- DBM Criteria & Evidence (PDF)
- Workflow Portal Script
- Vue Session & Dashboards
- Dashboard Config & OCR Paths
- Frontend Dependencies
- Cycle Metrics UI Helpers
- Core TypeScript Types
- API Fetch & Session Helpers
- Backend TS Config
- Faculty Rank Constants
- Summary Sheet Builders
- Workflow Formatting Helpers
- Faculty & TQE Types
- Frontend Node TS Config
- Faculty Form Handling
- Evaluator Upload Grouping
- Auth Middleware & Env
- Auth Controller & Tokens
- Upload Panel Definitions
- Frontend App TS Config
- Faculty ML Predictions
- Promotion History & Payload
- Promotion Insight Formatting
- Upload Document Handling
- Training Example Controller
- Admin & Review Routes
- Prediction Utility Functions
- UI Helper Utilities
- Panel Score Grouping
- Evaluator Assessment Utils
- Upload Card Rendering
- Icon Sprite Sheet
- Evaluator Criteria Rendering
- Frontend Root TS Config
- PDF Parse Type Defs
- Vue HelloWorld Component
- Graphify Fast-Path Docs
- Graphify PowerShell Bug Note
- Favicon Logo Asset
- Hero Illustration Asset
- Vite Logo Asset
- Vue Logo Asset
- auth.middleware.ts
- buildSummarySheetCriteriaSections
- KRA I - Instruction (PDF)
- scripts
- graphify reference: extra exports and benchmark
- graphify reference: query, path, explain
- package.json
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- bootstrap
- CLAUDE.md
- CLAUDE.md
- extraction-spec.md
- pdf-parse
- Graphify Trigger Instruction
- Project graphify Integration Rules
- /graphify add URL Ingestion
- --watch Background Auto-Rebuild
- Token Reduction Benchmark
- FalkorDB Export (--falkordb / --falkordb-push)
- MCP Stdio Server (--mcp)
- Neo4j Export (--neo4j / --neo4j-push)
- SVG / GraphML Export
- Wiki Export (--wiki)
- Extraction Subagent Prompt Template
- GitHub Repo Clone Flow
- Cross-Repo Graph Merge (merge-graphs)
- Monorepo Multi-Subfolder Flow
- Native CLAUDE.md Integration (graphify claude install)
- Git Post-Commit Auto-Rebuild Hook
- /graphify explain Node Explanation Flow
- /graphify path Shortest-Path Flow
- save-result Feedback / Work Memory Loop
- BFS/DFS Graph Traversal
- Constrained Query Vocabulary Expansion
- transcribe_all() Video/Audio Transcription
- Whisper Domain-Hint Prompt Composition
- build_merge() Direction-Preserving Merge
- --cluster-only Re-Clustering
- graph_diff() Update Summary
- --update Incremental Re-Extraction
- Part A: Structural (AST) Extraction
- Part B: Semantic Extraction via Subagents
- Part C: Merge AST + Semantic Extraction
- Shrink-Guard on graph.json Write (#479)
- Step 1: Detect graphify Python Interpreter
- Step 2: Detect Files
- Step 3: Extract Entities and Relationships
- Step 4.5: Graph Health Check
- Step 4: Build Graph, Cluster, Analyze, Export
- Step 5: Label Communities
- Step 6: Generate Obsidian Vault + HTML
- Step 9: Save Manifest, Update Cost Tracker, Cleanup
- Vue 3 + Vite Frontend Entry (index.html)
- bfar-ml Repository (ML Workflow Migration)
- evidenceRules.ts

## God Nodes (most connected - your core abstractions)
1. `escapeHtml()` - 37 edges
2. `buildDraftPointSummary()` - 25 edges
3. `escapeHtml()` - 22 edges
4. `Faculty Promotion System` - 22 edges
5. `renderReviewQueue()` - 20 edges
6. `compilerOptions` - 16 edges
7. `resolveOfficialRankOutcome()` - 16 edges
8. `compilerOptions` - 16 edges
9. `loadEvaluatorWorkspace()` - 14 edges
10. `buildPromotionDraftSnapshot()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Employee Portal UI` --conceptually_related_to--> `Employee Side`  [INFERRED]
  public/employee.html → README.md
- `Evaluator Portal UI` --conceptually_related_to--> `Evaluator Side`  [INFERRED]
  public/evaluator.html → README.md
- `Evaluator Portal UI` --conceptually_related_to--> `Evaluator Metrics To Add`  [INFERRED]
  public/evaluator.html → README.md
- `pdf-output.txt (Raw Extracted DBM-JC Text)` --shares_data_with--> `DBM-CHED Joint Circular No. 3, s. 2022 (NBC 461) - List of Documentary Evidences`  [EXTRACTED]
  scripts/pdf-output.txt → DBM-JC-No-3-s-2022-9th-cycle-NBC-461-with-Annexes.pdf
- `pdf-output-utf8.txt (UTF-8 Extracted DBM-JC Text)` --shares_data_with--> `DBM-CHED Joint Circular No. 3, s. 2022 (NBC 461) - List of Documentary Evidences`  [EXTRACTED]
  scripts/pdf-output-utf8.txt → DBM-JC-No-3-s-2022-9th-cycle-NBC-461-with-Annexes.pdf

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **graphify Extraction & Build Pipeline (Steps 3-4)** — claude_skills_graphify_skill_step3_extraction, claude_skills_graphify_skill_part_a_ast, claude_skills_graphify_skill_part_b_semantic, claude_skills_graphify_skill_part_c_merge, claude_skills_graphify_skill_step4_build_graph [EXTRACTED 1.00]
- **Shared Portal UI Pattern (Preview Modal + workflow.js)** — public_employee_employee_portal, public_evaluator_evaluator_portal, public_workflow_module [INFERRED 0.85]

## Communities (112 total, 56 thin omitted)

### Community 0 - "Dashboard Routing & Profiles"
Cohesion: 0.06
Nodes (72): reviewCycleMetricDefinitions, reviewCycleMetricKeys, reviewCycleYearLabels, getEmployeeDashboard(), getEvaluatorQueue(), applyEvidenceValidationToPromotionDraft(), applyRankIncrementRules(), buildDraftPointSummary() (+64 more)

### Community 1 - "Auth Portal Frontend (app.js)"
Cohesion: 0.03
Nodes (60): addPromotionHistoryButton, apiBaseUrl, authForm, authResult, authSubmit, CYCLE_METRIC_DEFINITIONS, cycleMetricsGrid, databaseViewer (+52 more)

### Community 2 - "Supabase & Document Controller"
Cohesion: 0.08
Nodes (49): guidelinePdfPath, isOcrReadyFlag, ocrConfig, ocrScriptPath, publicDir, repoRoot, tqeCsvPath, tqeReferenceRecords (+41 more)

### Community 3 - "Backend Dependencies"
Cohesion: 0.12
Nodes (17): devDependencies, prisma, tsx, @types/cors, @types/express, @types/jsonwebtoken, @types/multer, @types/node (+9 more)

### Community 4 - "Graphify Skill Docs"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 5 - "DBM Criteria & Evidence (PDF)"
Cohesion: 0.05
Nodes (44): app.js (Auth Portal Script), config.js (Portal Config Script), Document Preview Modal (Employee), Employee Portal UI, Document Preview Modal (Evaluator), Evaluator Portal UI, Access Portal (Sign In / Register), workflow.js (Portal Behavior Script) (+36 more)

### Community 6 - "Workflow Portal Script"
Cohesion: 0.07
Nodes (34): apiBaseUrl, buildApiUrl(), closeDocumentPreview(), documentPreviewFrame, documentPreviewMeta, documentPreviewModal, documentPreviewStatus, documentPreviewTitle (+26 more)

### Community 7 - "Vue Session & Dashboards"
Cohesion: 0.11
Nodes (25): apiFetch(), mergeHeaders(), readErrorMessage(), AppUserRole, clearSession(), fetchSession(), getHomePathForRole(), rememberSession() (+17 more)

### Community 8 - "Dashboard Config & OCR Paths"
Cohesion: 0.18
Nodes (13): buildSummarySheetFormalName(), buildSummarySheetPrintHtml(), collectSummarySheetValues(), downloadSummarySheetPdf(), getSummarySheetAssessment(), handleEmployeeProfileAction(), loadSummarySheetFromRecord(), renderSummarySheetCriteriaSection() (+5 more)

### Community 9 - "Frontend Dependencies"
Cohesion: 0.07
Nodes (26): dependencies, vue, vue-router, devDependencies, @types/node, typescript, vite, @vitejs/plugin-vue (+18 more)

### Community 10 - "Cycle Metrics UI Helpers"
Cohesion: 0.15
Nodes (22): escapeHtml(), formatDatabaseValue(), formatScorePreview(), getUploadedFilesFilterState(), getUploadTypeLabel(), loadDatabaseOverview(), matchesUploadedFileFilter(), renderDatabaseOverview() (+14 more)

### Community 11 - "Core TypeScript Types"
Cohesion: 0.06
Nodes (33): AppUserRole, AuthResponse, CycleMetrics, CycleMetricSummary, CycleMetricYearEntry, DocumentAnalysisResult, DocumentExtractionResult, EmployeeUploadType (+25 more)

### Community 12 - "API Fetch & Session Helpers"
Cohesion: 0.16
Nodes (22): apiFetch(), bootstrap(), buildApiUrl(), buildUploadNotice(), ensureSession(), getHomePathForRole(), handleDeleteUploadClick(), handlePanelUploadSubmit() (+14 more)

### Community 13 - "Backend TS Config"
Cohesion: 0.08
Nodes (24): dist, DOM, ES2022, node_modules, src/**/*, compilerOptions, declaration, declarationMap (+16 more)

### Community 14 - "Faculty Rank Constants"
Cohesion: 0.08
Nodes (30): tqeReferenceSummary, academicRankAliases, academicRankOptions, attainmentAliases, educationalAttainmentOptions, normalizeAcademicRankOption(), normalizeEducationalAttainmentOption(), normalizeKey() (+22 more)

### Community 15 - "Summary Sheet Builders"
Cohesion: 0.33
Nodes (7): buildScoreHelpText(), collectCriterionScores(), describePanelAudience(), groupPanelsByKra(), hydrateTrainingForm(), renderEvaluatorCriteria(), syncCriterionScoreTotal()

### Community 16 - "Workflow Formatting Helpers"
Cohesion: 0.18
Nodes (13): formatCriterionLabel(), formatKraShortLabel(), formatNumber(), formatOptionalNumber(), formatScoreWithMax(), renderEmployeeNotifications(), renderEmployeeSummary(), renderReviewCard() (+5 more)

### Community 17 - "Faculty & TQE Types"
Cohesion: 0.15
Nodes (26): analyzeDocumentContent(), buildCriterionScorePatterns(), buildDocumentSummary(), calculateBaseProbability(), clamp(), compareModels(), escapeRegex(), extractAllEvidenceKeywords() (+18 more)

### Community 18 - "Frontend Node TS Config"
Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+12 more)

### Community 19 - "Faculty Form Handling"
Cohesion: 0.12
Nodes (28): applyCycleDataToForm(), applyFacultyBaselineToForm(), buildFacultyPayload(), buildPromotionRankOptions(), byId(), collapseFacultyFormLegacy(), collapseFacultyFormWithModeSupport(), collectPromotionHistory() (+20 more)

### Community 20 - "Evaluator Upload Grouping"
Cohesion: 0.16
Nodes (20): collectEvaluatorDocuments(), formatDate(), getEmployeeUploadGroupLabel(), getKraLabel(), getPreviewActionLabel(), getUploadGroupSubheading(), getUploadSortPriority(), getUploadTypeLabel() (+12 more)

### Community 21 - "Auth Middleware & Env"
Cohesion: 0.19
Nodes (9): prisma, ensureDocumentsBucket(), updateReviewStatus(), errorHandler(), router, app, bootstrap(), publicDir (+1 more)

### Community 22 - "Auth Controller & Tokens"
Cohesion: 0.23
Nodes (15): clearCookieFallback(), generateToken(), getHomePathForRole(), login(), logout(), me(), register(), setCookieFallback() (+7 more)

### Community 23 - "Upload Panel Definitions"
Cohesion: 0.18
Nodes (14): UploadPanelDefinition, UploadPanelKey, uploadPanelKeywordMap, uploadPanelLabelMap, uploadPanels, evidenceRules, RequirementRule, RequirementType (+6 more)

### Community 24 - "Frontend App TS Config"
Cohesion: 0.13
Nodes (14): compilerOptions, erasableSyntaxOnly, noFallthroughCasesInSwitch, noUnusedLocals, noUnusedParameters, tsBuildInfoFile, types, extends (+6 more)

### Community 25 - "Faculty ML Predictions"
Cohesion: 0.29
Nodes (13): buildProfileArtifacts(), buildStoredFeatureEnvelope(), compareModels(), featureSelection(), generatePredictions(), ingestFaculty(), updateFaculty(), upsertDraftTrainingItem() (+5 more)

### Community 26 - "Promotion History & Payload"
Cohesion: 0.33
Nodes (7): averageNumbers(), collectCycleMetrics(), handleCycleMetricInput(), readCycleMetricInput(), renderCycleMetricInputs(), setCycleMetricValues(), syncCycleMetricSummaries()

### Community 27 - "Promotion Insight Formatting"
Cohesion: 0.17
Nodes (19): buildInsightSeries(), formatOptionalNumber(), getCoverageBucket(), getCoverageBucketLabel(), getPromotionBasisLabel(), getPromotionConfidenceLabel(), getPromotionStatusLabel(), getReviewQueueConfidenceValue() (+11 more)

### Community 28 - "Upload Document Handling"
Cohesion: 0.40
Nodes (14): apiFetch(), deactivateAccountAction(), deleteAccountAction(), deleteUploadDocument(), handleAccountsActionClick(), handleUploadListActionClick(), handleUploadSubmit(), loadEmployeeWorkspace() (+6 more)

### Community 29 - "Training Example Controller"
Cohesion: 0.26
Nodes (9): createTrainingExample(), getTrainingExamples(), labelTrainingExample(), router, TrainingExampleSubmission, serializeEvaluatorAssessment(), facultyIngestionSchema, trainingLabelSchema (+1 more)

### Community 30 - "Admin & Review Routes"
Cohesion: 0.19
Nodes (13): env, envSchema, INSECURE_AUTH_SECRETS, getDatabaseOverview(), getDashboardProfile(), requireAuth(), requireRole(), router (+5 more)

### Community 31 - "Prediction Utility Functions"
Cohesion: 0.46
Nodes (6): assertNotLastManager(), deactivateAccount(), deleteAccount(), listAccounts(), reactivateAccount(), router

### Community 32 - "UI Helper Utilities"
Cohesion: 0.31
Nodes (5): byId(), escapeHtml(), numberOf(), showToast(), valueOf()

### Community 33 - "Panel Score Grouping"
Cohesion: 0.16
Nodes (18): buildUploadTypeCounts(), escapeHtml(), getComputedStatusLabel(), getPanelComputedScore(), getPanelUploadCount(), groupPanelsByKra(), hasPanelUpload(), renderComputedPanelScore() (+10 more)

### Community 34 - "Evaluator Assessment Utils"
Cohesion: 0.44
Nodes (8): createEvaluatorAssessment(), EvaluatorAssessment, parseEvaluatorAssessment(), readJsonObject(), readNumberRecord(), readOptionalNumber(), roundScore(), sanitizeCriterionScores()

### Community 35 - "Upload Card Rendering"
Cohesion: 0.32
Nodes (8): getPanelScorePreview(), getPanelUploadCount(), hasPanelUpload(), hasPanelUploads(), renderUploadCardBlock(), renderUploadGroupBlock(), renderUploadPanels(), renderUploadVariantForm()

### Community 36 - "Icon Sprite Sheet"
Cohesion: 0.43
Nodes (7): Bluesky logo icon (butterfly mark, viewBox 0 0 16 17, id=bluesky-icon), Discord logo icon (game-controller/mask glyph, viewBox 0 0 20 19, id=discord-icon), Documentation icon (outlined book/chevrons glyph, purple stroke #aa3bff, viewBox 0 0 21 20, id=documentation-icon), GitHub logo icon (Octocat silhouette, viewBox 0 0 19 19, id=github-icon), Social/community icon (people silhouette with settings/star badge, purple stroke #aa3bff, viewBox 0 0 20 20, id=social-icon), icons.svg – SVG icon sprite sheet (hidden <symbol> defs: bluesky, discord, documentation, github, social/community, x/twitter), X (formerly Twitter) logo icon (angular X mark, viewBox 0 0 19 19, id=x-icon)

### Community 37 - "Evaluator Criteria Rendering"
Cohesion: 0.12
Nodes (17): cors, express, express-rate-limit, jsonwebtoken, multer, dependencies, cors, express (+9 more)

### Community 53 - "auth.middleware.ts"
Cohesion: 0.48
Nodes (4): attachSessionUser(), SessionTokenPayload, SessionUser, parseCookieHeader()

### Community 54 - "buildSummarySheetCriteriaSections"
Cohesion: 0.20
Nodes (11): buildCycleMetricReviewCard(), buildCycleMetricValidations(), buildSummarySheetCriteriaSections(), buildSummarySheetSummaryMetrics(), formatMetricNumber(), formatOptionalMetricNumber(), formatSummarySheetKraLabel(), formatSummarySheetPoints() (+3 more)

### Community 55 - "KRA I - Instruction (PDF)"
Cohesion: 0.22
Nodes (10): Criterion A - Research Outputs Published, Criterion A - Teaching Effectiveness, Criterion B - Curriculum and Instructional Materials Development, Criterion B - Inventions, Criterion C - Special/Capstone Projects, Thesis, Dissertation and Mentorship Services, KRA I - Instruction (PDF), KRA II - Research, Innovation and/or Creative Work (PDF), DBM-CHED Joint Circular No. 3, s. 2022 (NBC 461) - List of Documentary Evidences (+2 more)

### Community 56 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, db:deploy, db:generate, db:migrate, db:push, db:studio, dev (+2 more)

### Community 57 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 58 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 59 - "package.json"
Cohesion: 0.40
Nodes (4): description, main, name, version

### Community 60 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 61 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 62 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 65 - "bootstrap"
Cohesion: 0.33
Nodes (6): bootstrap(), ensureDocumentPreviewShell(), prettyRole(), refreshSession(), renderAccountRow(), renderAccountsPanel()

### Community 69 - "pdf-parse"
Cohesion: 0.40
Nodes (4): @prisma/client, @prisma/client, main(), prisma

## Knowledge Gaps
- **337 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+332 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **56 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `uploadPanels` connect `Upload Panel Definitions` to `Dashboard Routing & Profiles`, `Supabase & Document Controller`, `Evaluator Assessment Utils`, `Faculty Rank Constants`, `Faculty & TQE Types`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Why does `prisma` connect `Auth Middleware & Env` to `Dashboard Routing & Profiles`, `Supabase & Document Controller`, `Auth Controller & Tokens`, `Faculty ML Predictions`, `Training Example Controller`, `Admin & Review Routes`, `Prediction Utility Functions`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _337 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dashboard Routing & Profiles` be split into smaller, more focused modules?**
  _Cohesion score 0.06080246913580247 - nodes in this community are weakly interconnected._
- **Should `Auth Portal Frontend (app.js)` be split into smaller, more focused modules?**
  _Cohesion score 0.03225806451612903 - nodes in this community are weakly interconnected._
- **Should `Supabase & Document Controller` be split into smaller, more focused modules?**
  _Cohesion score 0.07864488808227466 - nodes in this community are weakly interconnected._
- **Should `Backend Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._