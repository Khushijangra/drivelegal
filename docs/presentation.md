# DriveLegal: 20-Slide Presentation Structure
**The Arch: RAG and Agentic AI Hackathon Submission**

*Tip: Keep text minimal on slides. Use high-quality diagrams, screenshots, and bold metrics.*

## Section 1: The Hook & The Problem (Slides 1-4)
- **Slide 1: Title Slide**
  - DriveLegal: Agentic Legal Intelligence Platform.
  - Subtitle: "Making Legal Compliance Explanable, Accessible, and Evidence-Grounded."
  - *Visual: DriveLegal Logo + The Arch Hackathon Badge.*
- **Slide 2: The Core Problem**
  - Legal information is fragmented, dense, and disconnected from geospatial realities (state vs. national rules).
  - *Visual: A complex web of overlapping Indian legal documents.*
- **Slide 3: The Flaw in Current AI Solutions**
  - "Standard Legal Chatbots Fail."
  - They rely on single LLM calls, hallucinate penalties, and act as black boxes with no legal traceability.
- **Slide 4: The Solution: DriveLegal**
  - An Agentic platform combining hybrid retrieval, deterministic reasoning, and verifiable evidence grounding.

## Section 2: Agentic Architecture & RAG (Slides 5-11)
- **Slide 5: System Architecture Overview**
  - *Visual: Embed `docs/architecture.png`.*
  - Highlight the flow from Query -> Agents -> Knowledge Store -> Synthesis.
- **Slide 6: Multi-Agent Orchestration**
  - Break down the Custom Agent Layer: Query Understanding, Retrieval, Reasoning, Compliance, Response Synthesis.
- **Slide 7: Advanced Hybrid RAG Pipeline**
  - Step 1: Semantic Embeddings (Vector Search).
  - Step 2: Lexical Search (BM25 for exact legal codes).
  - Step 3: Reciprocal Rank Fusion (RRF) for merged accuracy.
- **Slide 8: Geospatial Legal Context (PostGIS)**
  - How we solve overlapping jurisdictions. If a query happens in Delhi, only Delhi rules + National rules apply.
- **Slide 9: Explainability & Evidence Grounding**
  - "Zero Hallucination Tolerance."
  - *Visual: Side-by-side of an AI answer pointing directly to an exact highlighted paragraph in a Gazette PDF.*
- **Slide 10: Deterministic Compliance Math**
  - LLMs are bad at math. We use a deterministic Compliance Agent to calculate compounding penalties.
- **Slide 11: The Vision AI Pipeline (Bonus Innovation)**
  - Brief highlight of the ONNX YOLOS-tiny implementation for detecting physical road hazards that lead to legal penalties.

## Section 3: Live Demo & Impact (Slides 12-16)
- **Slide 12: Live Demonstration**
  - *Visual: Embedded video or placeholder for live switch.*
  - "Watch DriveLegal process a complex multi-hop jurisdiction query."
- **Slide 13: Demo Case Study: The Overloaded Truck**
  - Walk through how the agents handled a specific, difficult query shown in the demo.
- **Slide 14: System Benchmarks**
  - Retrieval Accuracy: 92%
  - Context Precision: 89%
  - Warm Query Latency: ~158ms
- **Slide 15: Tech Stack**
  - TypeScript, PostgreSQL + PostGIS, React, Custom RAG Engine.
  - "Built for production, not just a prototype."
- **Slide 16: Real-World Impact**
  - Empowering citizens to challenge arbitrary fines.
  - Empowering traffic authorities with indisputable, evidence-backed citations.

## Section 4: The Future & Q&A (Slides 17-20)
- **Slide 17: Post-Release Roadmap**
  - Q3 2025: Citizen Portal UI & Admin Dashboard.
  - Q4 2025: Real-time commercial fleet compliance monitoring.
- **Slide 18: Why DriveLegal Wins "The Arch"**
  - Matches the theme perfectly: Deep RAG implementation + True Agentic workflow.
- **Slide 19: The Team**
  - Khushi Jangra - Full Stack AI Engineer.
- **Slide 20: Q&A**
  - "Thank you. Open for questions."
  - *Visual: QR Code to the GitHub Repository or Live Deployment.*
