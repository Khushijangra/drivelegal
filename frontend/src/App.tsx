import { useEffect, useMemo, useState, useRef } from 'react';
import { apiFetch, adminFetch } from './api';
import type { 
  ChallanItem,
  ChallanResult, 
  EvidenceItem,
  OfficialSource, 
  QueryResponse, 
  RuleRecord, 
  VisionAnalysisResult, 
  VisionViolation,
  BenchmarkCase,
  SuiteType
} from './types';

// Auto-location mapping (State -> Coordinates & Code)
const STATE_LOCATIONS = [
  { name: 'Delhi', code: 'DL', lat: 28.6139, lon: 77.2090 },
  { name: 'Haryana', code: 'HR', lat: 29.0588, lon: 76.0856 },
  { name: 'Punjab', code: 'PB', lat: 31.1471, lon: 75.3412 },
  { name: 'Uttar Pradesh (UP)', code: 'UP', lat: 26.8467, lon: 80.9462 },
  { name: 'Rajasthan', code: 'RJ', lat: 27.0238, lon: 74.2179 },
  { name: 'Maharashtra', code: 'MH', lat: 19.7515, lon: 75.7139 },
  { name: 'Karnataka', code: 'KA', lat: 15.3173, lon: 75.7139 },
  { name: 'Tamil Nadu', code: 'TN', lat: 11.1271, lon: 78.6569 }
];

// Card UI Elements (Section A Overhaul)
interface CardProps {
  content: string;
}

function FineSummaryCard({ content }: CardProps) {
  return (
    <div className="card-item summary-card">
      <div className="card-header">🚦 Fine Summary</div>
      <div className="card-body">{content}</div>
    </div>
  );
}

function LegalProvisionCard({ content }: CardProps) {
  return (
    <div className="card-item provision-card">
      <div className="card-header">📜 Legal Provision</div>
      <div className="card-body">{content}</div>
    </div>
  );
}

function JurisdictionCard({ content }: CardProps) {
  return (
    <div className="card-item jurisdiction-card">
      <div className="card-header">📍 Jurisdiction</div>
      <div className="card-body">{content}</div>
    </div>
  );
}

function FineAmountCard({ content }: CardProps) {
  return (
    <div className="card-item fine-card">
      <div className="card-header">💰 Fine Amount</div>
      <div className="card-body fine-amount-highlight">{content}</div>
    </div>
  );
}

function ExplanationCard({ content }: CardProps) {
  return (
    <div className="card-item explanation-card">
      <div className="card-header">📝 Explanation</div>
      <div className="card-body">{content}</div>
    </div>
  );
}

function EvidenceCard({ content }: CardProps) {
  return (
    <div className="card-item evidence-card">
      <div className="card-header">📚 Evidence Sources</div>
      <div className="card-body source-excerpt">{content}</div>
    </div>
  );
}

function DisclaimerCard({ content }: CardProps) {
  return (
    <div className="card-item disclaimer-card">
      <div className="card-header">⚠ Disclaimer</div>
      <div className="card-body disclaimer-text">{content}</div>
    </div>
  );
}

function AnswerCard({ answer }: { answer: string }) {
  const parts = answer.split(/###\s+/);
  const sections: Record<string, string> = {};
  let generalText = '';

  parts.forEach((part) => {
    const lines = part.split('\n');
    const header = lines[0].trim();
    if (header) {
      const content = lines.slice(1).join('\n').trim();
      sections[header] = content;
    } else {
      const content = part.trim();
      if (content) generalText += content + '\n';
    }
  });

  const hasSections = Object.keys(sections).length > 0;

  if (!hasSections) {
    return <div className="raw-text-bubble">{answer}</div>;
  }

  return (
    <div className="structured-answer-grid">
      {generalText.trim() && <div className="general-intro">{generalText}</div>}
      {sections['🚦 Fine Summary'] && <FineSummaryCard content={sections['🚦 Fine Summary']} />}
      {sections['📜 Legal Provision'] && <LegalProvisionCard content={sections['📜 Legal Provision']} />}
      {sections['📍 Jurisdiction'] && <JurisdictionCard content={sections['📍 Jurisdiction']} />}
      {sections['💰 Fine Amount'] && <FineAmountCard content={sections['💰 Fine Amount']} />}
      {sections['📝 Explanation'] && <ExplanationCard content={sections['📝 Explanation']} />}
      {sections['📚 Evidence Sources'] && <EvidenceCard content={sections['📚 Evidence Sources']} />}
      {sections['⚠ Disclaimer'] && <DisclaimerCard content={sections['⚠ Disclaimer']} />}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────
const STATE_NAMES: Record<string, string> = {
  DL: 'Delhi', HR: 'Haryana', PB: 'Punjab', UP: 'Uttar Pradesh',
  RJ: 'Rajasthan', MH: 'Maharashtra', KA: 'Karnataka', TN: 'Tamil Nadu',
};

const VEHICLE_LABELS: Record<string, string> = {
  LMV: 'Light Motor Vehicle', HMV: 'Heavy Motor Vehicle',
  '2W': 'Two Wheeler', TWO_WHEELER: 'Two Wheeler',
  '4W': 'Four Wheeler', TAXI: 'Taxi / Commercial',
  COMMERCIAL: 'Commercial / Taxi',
};

function fmtInr(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

// Infer severity from offense code / description (backend doesn't send severity)
function inferSeverity(item: ChallanItem): 'high' | 'medium' | 'low' {
  const code = (item.offenseCode + item.sourceClause).toUpperCase();
  if (code.includes('HELMET') || code.includes('DRUNK') || code.includes('SPEED') || item.baseFine >= 2000) return 'high';
  if (code.includes('BELT') || code.includes('SIGNAL') || item.baseFine >= 500) return 'medium';
  return 'low';
}

// ── Summary Card ──────────────────────────────────────────────────────
function ChallanSummaryCard({ challan }: { challan: ChallanResult }) {
  const stateName = STATE_NAMES[challan.stateCode] ?? challan.stateCode;
  const vehicleLabel = VEHICLE_LABELS[challan.vehicleClass?.toUpperCase()] ?? challan.vehicleClass ?? '—';
  return (
    <div className="challan-summary-card">
      <div className="challan-summary-eyebrow">🚦 Challan Summary</div>
      <h3 className="challan-summary-title">Traffic Violation Notice</h3>
      <div className="challan-summary-meta-row">
        <div className="challan-meta-chip">
          <span className="challan-meta-label">State</span>
          <span className="challan-meta-value">{stateName}</span>
        </div>
        <div className="challan-meta-chip">
          <span className="challan-meta-label">Vehicle Class</span>
          <span className="challan-meta-value">{vehicleLabel}</span>
        </div>
        <div className="challan-meta-chip">
          <span className="challan-meta-label">Violations Found</span>
          <span className="challan-meta-value">{challan.items.length}</span>
        </div>
      </div>
      <div className="challan-summary-totals">
        <div className="challan-total-box">
          <span className="challan-total-label">Subtotal</span>
          <span className="challan-total-amount">{fmtInr(challan.subtotal)}</span>
        </div>
        <div className="challan-total-box">
          <span className="challan-total-label">Additional Penalties</span>
          <span className="challan-total-amount">{fmtInr(challan.adjustments)}</span>
        </div>
        <div className="challan-total-box">
          <span className="challan-total-label">Total Due</span>
          <span className="challan-total-amount grand">{fmtInr(challan.total)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Per-Violation Card ────────────────────────────────────────────────
function ViolationCard({ item, index }: { item: ChallanItem; index: number }) {
  const severity = inferSeverity(item);
  const itemTotal = item.baseFine + item.compoundingFine;
  const sourceUrl = item.sourceReference?.sourceUrl;
  const clause = item.sourceClause || item.sourceReference?.sourceClause || '—';
  return (
    <div className={`challan-violation-card severity-${severity}`}>
      <div className="violation-card-header">
        <div className="violation-card-title">
          <div className="violation-number-badge">#{index + 1}</div>
          <span className="violation-card-name">{item.description}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className={`severity-badge ${severity}`}>
            {severity === 'high' ? '🔴' : severity === 'medium' ? '🟡' : '🟢'} {severity}
          </span>
          <div className="violation-fine-amount">{fmtInr(itemTotal)}</div>
        </div>
      </div>

      <div className="violation-details-grid">
        <div className="violation-detail-row">
          <span className="violation-detail-label">Offense Code</span>
          <span className="violation-detail-value">{item.offenseCode}</span>
        </div>
        <div className="violation-detail-row">
          <span className="violation-detail-label">Legal Section</span>
          <span className="violation-detail-value">{clause}</span>
        </div>
        <div className="violation-detail-row">
          <span className="violation-detail-label">Base Fine</span>
          <span className="violation-detail-value">{fmtInr(item.baseFine)}</span>
        </div>
        <div className="violation-detail-row">
          <span className="violation-detail-label">Compounding Fine</span>
          <span className="violation-detail-value">{fmtInr(item.compoundingFine)}</span>
        </div>
        {item.demeritPoints > 0 && (
          <div className="violation-detail-row">
            <span className="violation-detail-label">Demerit Points</span>
            <span className="violation-detail-value">{item.demeritPoints} pts</span>
          </div>
        )}
      </div>

      <div className="violation-source-row">
        <span className="violation-source-text">
          📄 Source: {item.sourceReference?.sourceUrl
            ? new URL(item.sourceReference.sourceUrl).hostname.replace('www.', '')
            : 'Official Gazette'}
          {item.sourceReference?.pageNumber ? ` · p.${item.sourceReference.pageNumber}` : ''}
        </span>
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="violation-source-link">
            View Source ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ── Calculation Breakdown Card ────────────────────────────────────────
function CalcBreakdownCard({ challan }: { challan: ChallanResult }) {
  return (
    <div className="challan-calc-card">
      <div className="challan-card-heading">🧮 Calculation Breakdown</div>
      <div className="challan-calc-lines">
        {challan.items.map((item, i) => (
          <div className="calc-line" key={i}>
            <span className="calc-line-label">
              <span className="calc-line-code">{item.offenseCode}</span>
              {item.description}
            </span>
            <span className="calc-line-amount">{fmtInr(item.baseFine + item.compoundingFine)}</span>
          </div>
        ))}
        <div className="calc-divider" />
        <div className="calc-line subtotal">
          <span className="calc-line-label">Subtotal</span>
          <span className="calc-line-amount">{fmtInr(challan.subtotal)}</span>
        </div>
        {challan.adjustments > 0 && (
          <div className="calc-line">
            <span className="calc-line-label">Additional Charges / Modifiers</span>
            <span className="calc-line-amount">+{fmtInr(challan.adjustments)}</span>
          </div>
        )}
        <div className="calc-line grand-total">
          <span className="calc-line-label">Final Total Due</span>
          <span className="calc-line-amount">{fmtInr(challan.total)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Evidence Card ─────────────────────────────────────────────────────
function ChallanEvidenceCard({ items }: { items: EvidenceItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="challan-evidence-card">
      <div className="challan-card-heading">📚 Evidence Sources</div>
      <div className="evidence-grid">
        {items.slice(0, 5).map((ev, i) => (
          <div className="evidence-row" key={i}>
            <div className="evidence-row-meta">
              <div className="evidence-row-title">{ev.documentTitle}</div>
              <div className="evidence-row-authority">
                🏛 {ev.organization || 'Government Gazette'}
                <span className="evidence-row-page">p.{ev.pageNumber}</span>
              </div>
              {ev.excerpt && (
                <div className="evidence-row-excerpt">"{ev.excerpt}"</div>
              )}
              {ev.sourceUrl && (
                <a href={ev.sourceUrl} target="_blank" rel="noreferrer" className="evidence-open-btn">
                  Open Source ↗
                </a>
              )}
            </div>
            {ev.retrievalConfidence !== undefined && (
              <div className="evidence-confidence-bar">
                <span className="confidence-label">Relevance</span>
                <span className="confidence-value">
                  {(ev.retrievalConfidence * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Legal Transparency Card ───────────────────────────────────────────
function LegalTransparencyCard({ challan }: { challan: ChallanResult }) {
  return (
    <div className="challan-legal-card">
      <div className="challan-card-heading">⚖️ Legal Transparency</div>
      <div className="legal-match-row">
        {challan.items.map((item, i) => (
          <div className="legal-match-item" key={i}>
            <span className="legal-match-icon">📌</span>
            <div className="legal-match-body">
              <span className="legal-match-label">Rule Matched</span>
              <span className="legal-match-value">
                <strong>{item.offenseCode}</strong> — {item.description}
              </span>
              <span className="legal-match-value" style={{ color: 'var(--meta-color)', fontSize: '0.8rem' }}>
                Matched via offense code exact-match + vehicle class filter. 
                Clause: <strong>{item.sourceClause || item.sourceReference?.sourceClause || 'N/A'}</strong>
                {item.sourceReference?.pageNumber ? ` · Source page ${item.sourceReference.pageNumber}` : ''}
              </span>
            </div>
          </div>
        ))}
        {challan.items.length === 0 && (
          <div className="legal-match-item">
            <span className="legal-match-icon">⚠️</span>
            <div className="legal-match-body">
              <span className="legal-match-label">No Rules Matched</span>
              <span className="legal-match-value">No offense codes resolved against the current rule database. Check state code and offense code validity.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ChallanPanel (replaces ChallanBreakdownCard) ─────────────────
function ChallanPanel({ challan, evidenceItems }: { challan: ChallanResult; evidenceItems?: EvidenceItem[] }) {
  return (
    <div className="challan-panel">
      <ChallanSummaryCard challan={challan} />
      {challan.items.map((item, i) => (
        <ViolationCard key={i} item={item} index={i} />
      ))}
      <CalcBreakdownCard challan={challan} />
      {evidenceItems && evidenceItems.length > 0 && (
        <ChallanEvidenceCard items={evidenceItems} />
      )}
      <LegalTransparencyCard challan={challan} />
      {challan.warnings && challan.warnings.length > 0 && (
        <div className="challan-warnings-strip">
          <strong>⚠ System Notices</strong>
          <ul>
            {challan.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function ChallanBreakdownCard({ challan }: { challan: ChallanResult }) {
  const stateName = STATE_NAMES[challan.stateCode] ?? challan.stateCode;
  const vehicleLabel = VEHICLE_LABELS[challan.vehicleClass?.toUpperCase()] ?? challan.vehicleClass ?? '—';
  
  return (
    <div className="challan-breakdown-card" style={{
      background: 'linear-gradient(135deg, rgba(20, 30, 48, 0.95), rgba(36, 59, 85, 0.95))',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      borderRadius: '16px',
      padding: '1.25rem',
      marginTop: '0.75rem',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
      color: '#f3f4f6'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            ⚖️ Official Assessment
          </div>
          <h4 style={{ margin: '0.1rem 0 0 0', fontSize: '1.05rem', fontWeight: 700 }}>Challan Fine Breakdown</h4>
        </div>
        <span style={{ fontSize: '1.2rem' }}>🚦</span>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.82rem', background: 'rgba(255, 255, 255, 0.02)', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
        <div><span style={{ color: 'var(--meta-color)' }}>Jurisdiction:</span> <strong>{stateName}</strong></div>
        <div><span style={{ color: 'var(--meta-color)' }}>Vehicle Class:</span> <strong>{vehicleLabel}</strong></div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {challan.items.map((item, idx) => (
          <div key={idx} style={{
            background: 'rgba(0, 0, 0, 0.25)',
            borderLeft: '4px solid #f59e0b',
            padding: '0.6rem 0.75rem',
            borderRadius: '6px'
          }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.2rem', color: '#fff' }}>
              {item.description}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem', fontSize: '0.78rem', color: 'var(--meta-color)' }}>
              <div><strong>Section:</strong> {item.sourceClause || '—'}</div>
              <div><strong>Code:</strong> {item.offenseCode}</div>
              <div><strong>Base Fine:</strong> {fmtInr(item.baseFine)}</div>
              <div><strong>Compounding:</strong> {fmtInr(item.compoundingFine)}</div>
            </div>
          </div>
        ))}
      </div>

      {challan.adjustments > 0 && (
        <div style={{
          marginTop: '0.6rem',
          padding: '0.5rem 0.75rem',
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '6px',
          fontSize: '0.78rem',
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          <span style={{ color: '#f87171', fontWeight: 600 }}>⚡ Surcharges / Modifiers:</span>
          <strong style={{ color: '#f87171' }}>+{fmtInr(challan.adjustments)}</strong>
        </div>
      )}

      <div style={{
        marginTop: '0.75rem',
        paddingTop: '0.75rem',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <strong style={{ fontSize: '0.9rem' }}>Total Fine:</strong>
          <span style={{ fontSize: '0.75rem', color: 'var(--meta-color)', display: 'block' }}>(Base + Compounding + Modifiers)</span>
        </div>
        <strong style={{ fontSize: '1.4rem', color: '#10b981', textShadow: '0 0 8px rgba(16, 185, 129, 0.2)' }}>
          {fmtInr(challan.total)}
        </strong>
      </div>
    </div>
  );
}

function FormattedViolationDetails({ violation }: { violation: VisionViolation }) {
  // Extract values
  let what = violation.description;
  let why = violation.failureExplanation || `Confidence score: ${violation.confidence}%`;
  let law = 'Motor Vehicles Act (MVA)';
  let penalty = 'Standard Penalty';
  let action = violation.recommendation || 'Drive carefully.';

  const lowerType = violation.type.toLowerCase();
  if (lowerType.includes('helmet')) {
    if (lowerType.includes('missing') || violation.description.toLowerCase().includes('missing')) {
      what = 'Missing Safety Helmet';
      law = 'Section 129 read with Section 194D, Motor Vehicles Act (MVA)';
      penalty = '₹1,000 fine & license suspension up to 3 months';
      action = 'Wear an ISI-certified helmet and secure the chin strap immediately.';
    } else {
      what = 'Helmet Verified';
      law = 'Section 129, Motor Vehicles Act (MVA)';
      penalty = '₹0 (Compliance confirmed)';
      action = 'No action required. Safe journey!';
    }
  } else if (lowerType.includes('seatbelt')) {
    if (lowerType.includes('violation') || violation.description.toLowerCase().includes('not detected')) {
      what = 'Seatbelt Non-Compliance';
      law = 'Section 194B, Motor Vehicles Act (MVA)';
      penalty = '₹1,000 fine per unbelted occupant';
      action = 'Ensure all occupants are buckled in securely before proceeding.';
    } else {
      what = 'Seatbelt Verified';
      law = 'Section 194B, Motor Vehicles Act (MVA)';
      penalty = '₹0 (Compliance confirmed)';
      action = 'No action required. Keep buckled!';
    }
  } else if (lowerType.includes('pothole') || lowerType.includes('hazard')) {
    what = 'Road Surface Pothole / Distress';
    law = 'Section 198A, Motor Vehicles Act (MVA) (Duty of Road Authorities)';
    penalty = 'Actionable civic authority liability';
    action = 'Slow down, maintain distance, and alert local municipal safety boards.';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem', marginTop: '0.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.4rem' }}>
        <span style={{ color: 'var(--meta-color)', fontWeight: 600 }}>🔍 Detected:</span>
        <strong style={{ color: '#fff' }}>{what}</strong>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.4rem' }}>
        <span style={{ color: 'var(--meta-color)', fontWeight: 600 }}>💡 Why:</span>
        <span>{why}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.4rem' }}>
        <span style={{ color: 'var(--meta-color)', fontWeight: 600 }}>⚖️ Law:</span>
        <span style={{ color: 'var(--accent-color)', fontWeight: 600 }}>{law}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.4rem' }}>
        <span style={{ color: 'var(--meta-color)', fontWeight: 600 }}>🚨 Penalty:</span>
        <strong style={{ color: violation.severity === 'high' ? '#f87171' : 'var(--text-color)' }}>{penalty}</strong>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem' }}>
        <span style={{ color: 'var(--meta-color)', fontWeight: 600 }}>🛡️ Action:</span>
        <span style={{ fontStyle: 'italic', color: '#6ee7b7' }}>{action}</span>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'chat' | 'vision' | 'benchmark' | 'admin' | 'calculator'>('chat');
  const [showLocationSettings, setShowLocationSettings] = useState(false);
  const [selectedRule, setSelectedRule] = useState<RuleRecord | null>(null);

  // Conversational Chat States
  const [question, setQuestion] = useState('');
  const [selectedStateIndex, setSelectedStateIndex] = useState(0);
  const [stateCode, setStateCode] = useState(STATE_LOCATIONS[0].code);
  const [vehicleClass, setVehicleClass] = useState('LMV');
  const [offenseCodes, setOffenseCodes] = useState('OVERSPEED');
  const [lat, setLat] = useState(String(STATE_LOCATIONS[0].lat));
  const [lon, setLon] = useState(String(STATE_LOCATIONS[0].lon));
  
  // Voice Input States
  const [isRecording, setIsRecording] = useState(false);

  // Staged Upload States
  const [stagedImage, setStagedImage] = useState<string | null>(null);

  // Camera capture states
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    evidence?: QueryResponse['evidenceBundle'];
    challan?: ChallanResult | null;
    confidence?: number;
    imagePreview?: string;
    visionDiagnostics?: VisionAnalysisResult | null;
  }

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Welcome to DriveLegal. Describe your traffic incident or upload a challan document to analyze compliance and calculate official fines.'
    }
  ]);

  // Calculator States
  const [calcStateCode, setCalcStateCode] = useState(STATE_LOCATIONS[0].code);
  const [calcVehicleClass, setCalcVehicleClass] = useState('LMV');
  const [calcSearchQuery, setCalcSearchQuery] = useState('');
  const [calcSearchResults, setCalcSearchResults] = useState<RuleRecord[]>([]);
  const [calcSelectedOffense, setCalcSelectedOffense] = useState<RuleRecord | null>(null);
  const [calcRepeatOffense, setCalcRepeatOffense] = useState(false);
  const [calcCommercial, setCalcCommercial] = useState(false);
  const [calcResult, setCalcResult] = useState<ChallanResult | null>(null);
  const [calcPdfUrl, setCalcPdfUrl] = useState<string | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  // Search rules for calculator
  useEffect(() => {
    if (calcSearchQuery.length >= 2) {
      const delayFn = setTimeout(async () => {
        try {
          const params = new URLSearchParams({ q: calcSearchQuery, stateCode: calcStateCode });
          const res = await apiFetch<{ rules: RuleRecord[] }>(`/api/rules/search?${params.toString()}`);
          setCalcSearchResults(res.rules);
        } catch (e) {
          console.error(e);
        }
      }, 300);
      return () => clearTimeout(delayFn);
    } else {
      setCalcSearchResults([]);
    }
  }, [calcSearchQuery, calcStateCode]);

  const runCalculator = async () => {
    if (!calcSelectedOffense) return;
    setCalcLoading(true);
    setCalcPdfUrl(null);
    try {
      const payload = {
        stateCode: calcStateCode,
        vehicleClass: calcVehicleClass,
        offenseCodes: [calcSelectedOffense.offenseCode],
        modifiers: {
          repeatOffense: calcRepeatOffense,
          commercialVehicle: calcCommercial
        }
      };
      const res = await apiFetch<ChallanResult>('/api/challan/calc', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setCalcResult(res);
    } catch (e) {
      console.error(e);
      alert('Failed to calculate challan.');
    } finally {
      setCalcLoading(false);
    }
  };

  const generateCalculatorPdf = async () => {
    if (!calcSelectedOffense || !calcResult) return;
    setCalcLoading(true);
    try {
      const payload = {
        stateCode: calcStateCode,
        vehicleClass: calcVehicleClass,
        offenseCodes: [calcSelectedOffense.offenseCode],
        evidenceUrl: 'https://drivelegal.com/calculator', // Dummy evidence URL for direct calc
        title: 'Calculator Generated Challan',
        modifiers: {
          repeatOffense: calcRepeatOffense,
          commercialVehicle: calcCommercial
        }
      };
      const res = await apiFetch<{ pdfDataUrl: string }>('/api/challan/generate', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setCalcPdfUrl(res.pdfDataUrl);
    } catch (e) {
      console.error(e);
      alert('Failed to generate PDF.');
    } finally {
      setCalcLoading(false);
    }
  };

  const [result, setResult] = useState<QueryResponse | null>(null);
  const [sources, setSources] = useState<OfficialSource[]>([]);
  const [challanDownload, setChallanDownload] = useState<{ pdfBase64: string; qrDataUrl: string; challan: ChallanResult } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Ready.');

  // Road Vision States
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string>('');
  const [visionResult, setVisionResult] = useState<VisionAnalysisResult | null>(null);
  const [visionLoading, setVisionLoading] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);

  // Judge Evaluation States
  const [benchmarkCases, setBenchmarkCases] = useState<BenchmarkCase[]>([]);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [realEvalStats, setRealEvalStats] = useState<any>(null);

  const runBenchmarkSuite = async (suite: SuiteType) => {
    setBenchmarkLoading(true);
    try {
      const categoryMap: Record<string, string> = {
        'Helmet': 'helmet_present',
        'Seatbelt': 'seatbelt_present',
        'Road Hazard': 'pothole',
        'Traffic': 'traffic'
      };
      const datasetCategory = categoryMap[suite] || 'helmet_present';
      const res = await apiFetch<any>('/api/vision/evaluate', {
        method: 'POST',
        body: JSON.stringify({ datasetCategory })
      });
      setRealEvalStats(res);
      // We can mock a case just to show history in the table, or leave table empty if evaluate only returns summary.
      // Let's add a summary case
      setBenchmarkCases(prev => [{
        id: Math.random().toString(36).substring(7),
        suite,
        imageSrc: '',
        groundTruth: 'Dataset: ' + datasetCategory,
        prediction: `Evaluated ${res.imagesEvaluated} images`,
        confidence: res.f1,
        isCorrect: res.imagesEvaluated > 0,
        inferenceTimeMs: res.averageLatencyMs,
        rawAnalysisResult: res
      }, ...prev]);
    } catch (e: any) {
      console.error(e);
    } finally {
      setBenchmarkLoading(false);
    }
  };

  const exportBenchmarkJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(realEvalStats || benchmarkCases, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "benchmark_export.json");
    dlAnchorElem.click();
  };

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [ruleQuery, setRuleQuery] = useState('speeding');
  const [ruleStateFilter, setRuleStateFilter] = useState('');
  const [rules, setRules] = useState<RuleRecord[]>([]);
  const [verifiedBy, setVerifiedBy] = useState('demo-judge');
  const [verificationNotes, setVerificationNotes] = useState('Verified against source PDF.');
  const [adminMessage, setAdminMessage] = useState('No rule selected yet.');

  const [adminStats, setAdminStats] = useState<{
    documentCount: number;
    chunkCount: number;
    ruleCount: number;
    jurisdictionCount: number;
    queryCount: number;
    citationCoveragePercent: number;
  } | null>(null);

  async function loadAdminStats() {
    try {
      const data = await adminFetch<any>('/api/admin/stats');
      setAdminStats(data);
    } catch (e) {
      console.error('Failed to load admin stats:', e);
    }
  }

  useEffect(() => {
    if (activeTab === 'admin') {
      void loadAdminStats();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'benchmark' && !realEvalStats && !benchmarkLoading) {
      void runBenchmarkSuite('Helmet');
    }
  }, [activeTab, realEvalStats, benchmarkLoading]);

  useEffect(() => {
    void loadSources();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // Handle auto-location dropdown select
  function handleStateSelect(index: number) {
    setSelectedStateIndex(index);
    const loc = STATE_LOCATIONS[index];
    setStateCode(loc.code);
    setLat(String(loc.lat));
    setLon(String(loc.lon));
  }

  async function loadSources() {
    try {
      const data = await apiFetch<{ sources: OfficialSource[] }>('/api/official-sources');
      setSources(data.sources);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load sources');
    }
  }

  // Camera Management
  async function startCamera() {
    setCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setCameraStream(stream);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error(err);
      alert('Camera access denied or unavailable.');
      setCameraActive(false);
    }
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }
    setCameraStream(null);
    setCameraActive(false);
  }

  function capturePhoto(target: 'chat' | 'vision') {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg');
      if (target === 'chat') {
        setStagedImage(dataUrl);
      } else {
        setUploadedImage(dataUrl);
        setImageFileName('captured_road_scene.jpg');
      }
      stopCamera();
    }
  }

  // Voice Speech Recognition Typing
  function startSpeechRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Web Speech API is not supported in this browser. Please use Chrome or Safari.');
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-IN';

    rec.onstart = () => {
      setIsRecording(true);
    };

    rec.onresult = (event: any) => {
      const speechToText = event.results[0][0].transcript;
      setQuestion(speechToText);
    };

    rec.onerror = (event: any) => {
      console.error('Speech error:', event.error);
      setIsRecording(false);
    };

    rec.onend = () => {
      setIsRecording(false);
    };

    rec.start();
  }

  async function runQuery() {
    const hasStaged = !!stagedImage;
    if (!question.trim() && !hasStaged) return;

    setLoading(true);
    setMessage('Processing...');

    // 1. Setup User Chat Bubble
    const userMsg: ChatMessage = { 
      role: 'user', 
      content: question || 'Staged Image Vision Diagnostic Query',
      imagePreview: stagedImage || undefined
    };
    
    setChatHistory((current) => [...current, userMsg]);
    const currentQuestion = question;
    const currentImage = stagedImage;
    
    setQuestion('');
    setStagedImage(null);

    try {
      let visionDiag: VisionAnalysisResult | null = null;
      
      // If image is uploaded in Chatbot, run road vision analyzer first
      if (currentImage) {
        visionDiag = await apiFetch<VisionAnalysisResult>('/api/vision/analyze', {
          method: 'POST',
          body: JSON.stringify({
            image: currentImage,
            fileName: 'chat_upload.jpg'
          })
        });
      }

      // Filter out raw text content logs, passing correct dialog context arrays (context-only history)
      const historyPayload = chatHistory
        .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
        .map((msg) => ({ role: msg.role, content: msg.content }));

      const queryPayload = {
        question: visionDiag ? `Vision Report: ${visionDiag.summary}. User inquiry: ${currentQuestion || 'Analyze image safety'}` : currentQuestion,
        stateCode: stateCode || undefined,
        vehicleClass: vehicleClass || undefined,
        offenseCodes: offenseCodes.split(',').map((v) => v.trim()).filter(Boolean),
        lat: lat ? Number(lat) : undefined,
        lon: lon ? Number(lon) : undefined,
        history: historyPayload,
      };

      const data = await apiFetch<QueryResponse>('/api/query', {
        method: 'POST',
        body: JSON.stringify(queryPayload),
      });

      setChatHistory((current) => [
        ...current,
        {
          role: 'assistant',
          content: data.answer,
          evidence: data.evidenceBundle,
          challan: data.challan,
          confidence: data.confidence,
          visionDiagnostics: visionDiag
        }
      ]);

      setResult(data);
      setChallanDownload(null);
      setMessage('Response synthethized.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error synthethizing response');
      setChatHistory((current) => [
        ...current,
        {
          role: 'assistant',
          content: `Failed to resolve query. Details: ${err instanceof Error ? err.message : 'Unknown exception.'}`
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function generateChallan() {
    setLoading(true);
    setMessage('Generating challan PDF...');
    try {
      const payload = {
        stateCode,
        vehicleClass,
        offenseCodes: offenseCodes.split(',').map((value) => value.trim()).filter(Boolean),
        evidenceUrl: `http://localhost:4000/api/evidence/${result?.evidenceBundle.items[0]?.documentId ?? 'doc'}`,
        title: 'Official DriveLegal Challan Document',
      };
      const data = await apiFetch<{ pdfBase64: string; qrDataUrl: string; challan: ChallanResult }>('/api/challan/generate', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setChallanDownload(data);
      setMessage('Challan generated.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to generate challan');
    } finally {
      setLoading(false);
    }
  }

  async function searchRules() {
    setLoading(true);
    setAdminMessage('Searching...');
    try {
      const params = new URLSearchParams({ q: ruleQuery });
      if (ruleStateFilter.trim()) params.set('stateCode', ruleStateFilter.trim());
      const data = await apiFetch<{ rules: RuleRecord[] }>(`/api/rules/search?${params.toString()}`);
      setRules(data.rules);
      setAdminMessage(`Found ${data.rules.length} matches.`);
      if (data.rules.length > 0) {
        setSelectedRule(data.rules[0]);
      } else {
        setSelectedRule(null);
      }
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : 'Rule lookup failed');
    } finally {
      setLoading(false);
    }
  }

  async function verifyRule(ruleId: string, status: 'approved' | 'rejected' | 'needs-review') {
    setLoading(true);
    setAdminMessage(`Updating status...`);
    try {
      await adminFetch(`/api/admin/rules/${ruleId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ status, notes: verificationNotes, verifiedBy }),
      });
      setAdminMessage(`Rule verified as ${status}.`);
      setRules((current) => current.map((rule) => {
        if (rule.id === ruleId) {
          const updated = {
            ...rule,
            verificationStatus: status,
            verificationNotes: verificationNotes,
            verifiedBy: verifiedBy,
            verifiedAt: new Date().toISOString()
          };
          if (selectedRule?.id === ruleId) {
            setSelectedRule(updated);
          }
          return updated;
        }
        return rule;
      }));
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  // Vision Drag & Drop handlers
  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setUploadedImage(ev.target?.result as string);
        setImageFileName(file.name);
      };
      reader.readAsDataURL(file);
    }
  }

  useEffect(() => {
    if (!canvasRef.current || !uploadedImage) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Scale to fit
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
      const x = (canvas.width / 2) - (img.width / 2) * scale;
      const y = (canvas.height / 2) - (img.height / 2) * scale;
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      
      if (visionResult) {
        drawBoundingBoxes(visionResult.violations);
      }
    };
    img.src = uploadedImage;
  }, [uploadedImage]);

  async function runVisionAnalysis() {
    if (!uploadedImage) return;
    setVisionLoading(true);
    setVisionError(null);
    try {
      const data = await apiFetch<VisionAnalysisResult>('/api/vision/analyze', {
        method: 'POST',
        body: JSON.stringify({
          image: uploadedImage,
          fileName: imageFileName,
        }),
      });
      setVisionResult(data);
      drawBoundingBoxes(data.violations);
    } catch (error) {
      setVisionError(error instanceof Error ? error.message : 'Vision diagnostics failed');
    } finally {
      setVisionLoading(false);
    }
  }

  function drawBoundingBoxes(violations: VisionViolation[]) {
    const canvas = canvasRef.current;
    if (!canvas || !uploadedImage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

      // Draw raw detections in grey
      if (visionResult && visionResult.rawDetections) {
        visionResult.rawDetections.forEach((det) => {
          if (det.box) {
            const { xmin, ymin, xmax, ymax } = det.box;
            const x = xmin;
            const y = ymin;
            const w = xmax - xmin;
            const h = ymax - ymin;
            
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.font = '10px monospace';
            ctx.fillText(det.label.toUpperCase(), x, y > 10 ? y - 2 : y + 10);
          }
        });
      }

      // Draw violation bounding boxes
      violations.forEach((violation) => {
        if (violation.boundingBox) {
          const [x, y, w, h] = violation.boundingBox;
          const strokeColor = violation.severity === 'high' ? '#ff3b30' : violation.severity === 'medium' ? '#ffcc00' : '#34c759';
          
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 5;
          ctx.strokeRect(x, y, w, h);

          // Box Confidence Tag (Section J)
          ctx.fillStyle = strokeColor;
          const labelText = `${violation.type.replace('-', ' ')} (${violation.confidence}%)`;
          ctx.font = 'bold 14px Inter, sans-serif';
          const textWidth = ctx.measureText(labelText).width;
          ctx.fillRect(x, y - 24, textWidth + 12, 24);

          ctx.fillStyle = '#ffffff';
          ctx.fillText(labelText, x + 6, y - 7);
        }
      });
  }

  const challanPdfHref = useMemo(() => {
    if (!challanDownload) return null;
    return `data:application/pdf;base64,${challanDownload.pdfBase64}`;
  }, [challanDownload]);

  const activeEvidence = useMemo(() => {
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      if (chatHistory[i].evidence?.items && chatHistory[i].evidence!.items.length > 0) {
        return chatHistory[i].evidence;
      }
    }
    return result?.evidenceBundle;
  }, [chatHistory, result]);

  return (
    <div className="app-shell">
      <div style={{ backgroundColor: 'rgba(255,193,7,0.1)', color: '#b28900', padding: '0.75rem', borderRadius: '12px', textAlign: 'center', marginBottom: '1.5rem', fontWeight: 600, fontSize: '0.9rem', border: '1px solid rgba(255,193,7,0.3)' }}>
        Informational only — not legal advice.
      </div>
      
      <header className="hero">
        <div>
          <p className="eyebrow">DriveLegal</p>
          <h1>Provenance-first road safety intelligence.</h1>
          <p className="lede">
            Conversational RAG assistant paired with edge pixel computer vision diagnostics.
          </p>
        </div>
        <div className="hero-card">
          <span>System Status</span>
          <strong>{message}</strong>
        </div>
      </header>

      {/* Tabs */}
      <nav className="tab-nav">
        <button className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
          💬 Legal Chatbot
        </button>
        <button className={`tab-btn ${activeTab === 'vision' ? 'active' : ''}`} onClick={() => setActiveTab('vision')}>
          👁️ Road Vision
        </button>
        <button className={`tab-btn ${activeTab === 'benchmark' ? 'active' : ''}`} onClick={() => setActiveTab('benchmark')}>
          📊 Judge Evaluation
        </button>
        <button className={`tab-btn ${activeTab === 'calculator' ? 'active' : ''}`} onClick={() => setActiveTab('calculator')}>
          🧮 Challan Calculator
        </button>
        <button className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')}>
          ⚙️ Rules Admin
        </button>
      </nav>

      <main className="content-grid">
        {activeTab === 'chat' && (
          <>
            <section className="panel chat-container">
              <h2>Legal Dialogue Assistant</h2>
              
              <div className="chat-messages">
                {chatHistory.map((msg, index) => (
                  <div key={index} className={`chat-message ${msg.role}`}>
                    {msg.imagePreview && (
                      <div className="chat-image-preview-container">
                        <img src={msg.imagePreview} alt="upload preview" className="chat-bubble-image" />
                      </div>
                    )}
                    
                    {msg.visionDiagnostics && (
                      <div className="inline-vision-panel">
                        <strong>👁️ Safety Diagnostics Summary:</strong>
                        <div className="inline-safety-score">Safety Index: {msg.visionDiagnostics.safetyScore}/100</div>
                        <ul className="inline-violations-list">
                          {msg.visionDiagnostics.violations.map((v, i) => (
                            <li key={i} className={`violation-tag ${v.severity}`}>
                              {v.type.replace('-', ' ')} ({v.confidence}%)
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <AnswerCard answer={msg.content} />
                    
                    {msg.challan && (
                      <ChallanBreakdownCard challan={msg.challan} />
                    )}
                    
                    {msg.evidence?.jurisdiction && msg.evidence.jurisdiction.length > 0 && (
                      <div className="msg-location-meta">
                        📍 Jurisdiction: {msg.evidence.jurisdiction.map(j => j.name).join(' > ')}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* State Dropdown Picker (Section C Auto-Location) */}
              <div className="state-selection-row" style={{ padding: '0 1rem', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  Select State Jurisdiction:
                  <select 
                    value={selectedStateIndex} 
                    onChange={(e) => handleStateSelect(Number(e.target.value))}
                    style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-color)' }}
                  >
                    {STATE_LOCATIONS.map((loc, idx) => (
                      <option key={idx} value={idx}>{loc.name} ({loc.code})</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Collapsible Location Override drawer */}
              <button className="location-drawer-btn" onClick={() => setShowLocationSettings(!showLocationSettings)}>
                ⚙️ {showLocationSettings ? 'Hide Coordinates Manual Override' : 'Show Coordinates Manual Override'}
              </button>

              {showLocationSettings && (
                <div className="location-drawer">
                  <div className="two-col" style={{ marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.82rem' }}>
                      State Code Override
                      <input value={stateCode} onChange={(event) => setStateCode(event.target.value)} />
                    </label>
                    <label style={{ fontSize: '0.82rem' }}>
                      Vehicle Class
                      <input value={vehicleClass} onChange={(event) => setVehicleClass(event.target.value)} />
                    </label>
                  </div>
                  <div className="two-col" style={{ marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.82rem' }}>
                      Latitude
                      <input value={lat} onChange={(event) => setLat(event.target.value)} />
                    </label>
                    <label style={{ fontSize: '0.82rem' }}>
                      Longitude
                      <input value={lon} onChange={(event) => setLon(event.target.value)} />
                    </label>
                  </div>
                  <label style={{ fontSize: '0.82rem' }}>
                    Offense Code Keys (comma separated)
                    <input value={offenseCodes} onChange={(event) => setOffenseCodes(event.target.value)} />
                  </label>
                </div>
              )}

              {/* Upload Previews in Chatbot */}
              {stagedImage && (
                <div className="staged-preview-bar">
                  <img src={stagedImage} alt="staged" className="staged-thumbnail" />
                  <button className="staged-remove-btn" onClick={() => setStagedImage(null)}>✕ Remove Image</button>
                </div>
              )}

              {/* Camera view in Chatbot */}
              {cameraActive && (
                <div className="camera-viewport-container">
                  <video ref={videoRef} autoPlay playsInline className="video-stream" />
                  <div className="camera-controls">
                    <button onClick={() => capturePhoto('chat')}>📸 Take Photo</button>
                    <button className="danger" onClick={stopCamera}>✕ Cancel</button>
                  </div>
                </div>
              )}

              <div className="chat-input-row">
                {/* Voice button (Section D) */}
                <button 
                  className={`voice-mic-btn ${isRecording ? 'pulse' : ''}`} 
                  onClick={startSpeechRecognition}
                  title="Speech To Text Transcription"
                  type="button"
                >
                  {isRecording ? '🛑' : '🎤'}
                </button>

                {/* Staging actions */}
                <button className="stage-upload-btn" onClick={() => document.getElementById('chat-file-input')?.click()} title="Upload Image File">📎</button>
                <input 
                  id="chat-file-input" 
                  type="file" 
                  accept="image/*" 
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const r = new FileReader();
                      r.onload = () => setStagedImage(r.result as string);
                      r.readAsDataURL(file);
                    }
                  }}
                />

                <button className="stage-camera-btn" onClick={startCamera} title="Capture from Camera">📷</button>

                <textarea 
                  value={question} 
                  placeholder={stagedImage ? "Add comments or submit..." : "Ask about traffic regulations or penalties..."}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void runQuery();
                    }
                  }}
                  rows={1}
                />
                
                <button className="chat-send-btn" onClick={runQuery} disabled={loading || (!question.trim() && !stagedImage)}>
                  Send
                </button>
              </div>
            </section>

            <section className="panel" style={{ height: '580px', overflowY: 'auto' }}>
              <h2>Active Reference Citations</h2>
              {activeEvidence ? (
                <div className="result-stack">
                  <article className="result-card">
                    <h3>Citations Bundle</h3>
                    <p className="meta">
                      Generated: {activeEvidence.generatedAt}
                      <br />
                      Jurisdiction Chain: {activeEvidence.jurisdiction.map(j => `${j.type}:${j.name}`).join(' > ')}
                    </p>
                    {activeEvidence.items.length === 0 ? (
                      <p>No document source citations extracted.</p>
                    ) : (
                      <div className="stacked-cards">
                        {activeEvidence.items.map((item) => (
                          <div key={item.chunkId} className="evidence-item">
                            <div className="evidence-header">
                              <strong>{item.documentTitle}</strong>
                              <span>p. {item.pageNumber}</span>
                            </div>
                            <p className="meta">{item.organization || 'Government Gazeteer'} · OCR Confidence {item.ocrConfidence?.toFixed(2) ?? 'n/a'} · Rank {item.retrievalConfidence?.toFixed(2) ?? 'n/a'}</p>
                            <p>{item.excerpt}</p>
                            <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="citation-btn">Open Gazette Link</a>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>

                  {result?.challan && (
                    <ChallanPanel
                      challan={result.challan}
                      evidenceItems={activeEvidence?.items}
                    />
                  )}
                  {result?.challan && (
                    <div className="button-row" style={{ marginTop: '0.5rem' }}>
                      <button onClick={generateChallan} disabled={loading} style={{ borderRadius: '16px' }}>
                        📄 Generate QR Challan PDF
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p>Citations and deterministic breakdowns will generate here dynamically as you communicate.</p>
              )}
            </section>

            {/* QR download card */}
            <section className="panel full-width">
              <h2>Secure QR Challan Downloads</h2>
              {challanDownload && challanPdfHref ? (
                <div className="qr-layout">
                  <img src={challanDownload.qrDataUrl} alt="QR Code" className="qr-image" />
                  <div>
                    <p>Verified cryptographically secure challan printout document ready.</p>
                    <a className="download-link" href={challanPdfHref} download="drivelegal-challan.pdf">Download Print PDF</a>
                  </div>
                </div>
              ) : (
                <p>Use challan panel above to generate official offline secure copies.</p>
              )}
            </section>
          </>
        )}

        {activeTab === 'vision' && (
          <>
            <section className="panel">
              <h2>Road Safety Vision Feed</h2>
              
              {cameraActive && (
                <div className="camera-viewport-container" style={{ marginBottom: '1rem' }}>
                  <video ref={videoRef} autoPlay playsInline className="video-stream" />
                  <div className="camera-controls">
                    <button onClick={() => capturePhoto('vision')}>📸 Take Photo</button>
                    <button className="danger" onClick={stopCamera}>✕ Cancel</button>
                  </div>
                </div>
              )}

              <div className="dropzone-container">
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleImageUpload} 
                  id="image-file-input" 
                  style={{ display: 'none' }} 
                />
                
                <label htmlFor="image-file-input" className="dropzone-label">
                  {uploadedImage ? (
                    <div className="preview-container">
                      <canvas ref={canvasRef} className="vision-canvas" />
                    </div>
                  ) : (
                    <div className="dropzone-placeholder">
                      <span className="dropzone-icon">📸</span>
                      <p>Drag and drop or click to upload road safety images</p>
                      <span className="meta">Supports JPG, PNG (Max 5MB)</span>
                    </div>
                  )}
                </label>
              </div>

              {/* Camera action in Vision tab */}
              <button 
                onClick={startCamera} 
                disabled={cameraActive} 
                style={{ width: '100%', borderRadius: '16px', background: 'var(--btn-bg)', color: '#fff', padding: '0.75rem', marginBottom: '0.75rem', fontWeight: 600 }}
              >
                🎥 Capture Image from Live Camera
              </button>

              <button 
                onClick={runVisionAnalysis} 
                disabled={visionLoading || !uploadedImage}
                style={{ width: '100%', borderRadius: '16px' }}
              >
                {visionLoading ? 'Running Edge Diagnostics...' : 'Run Vision AI Analysis'}
              </button>
            </section>

            <section className="panel" style={{ maxHeight: '680px', overflowY: 'auto' }}>
              <h2>Diagnostics Dashboard</h2>
              {visionError && <p className="text-danger" style={{ padding: '0.5rem', background: 'rgba(255,59,48,0.08)', borderRadius: '10px' }}>{visionError}</p>}

              {visionResult ? (
                <div className="result-stack">

                  {/* Card 1: Safety Score Card */}
                  <article className="result-card safety-score-card" style={{ padding: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-color)' }}>🛡️ Safety Score</h3>
                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.82rem', color: 'var(--meta-color)' }}>
                          Combined edge vision assessment index
                        </p>
                      </div>
                      <div className={`score-badge ${visionResult.safetyScore >= 80 ? 'success' : visionResult.safetyScore >= 50 ? 'warning' : 'danger'}`} style={{ margin: 0, fontSize: '1.4rem', padding: '0.4rem 1rem' }}>
                        {visionResult.safetyScore} / 100
                      </div>
                    </div>
                    <p style={{ marginTop: '0.85rem', fontWeight: 500, fontSize: '0.9rem', lineHeight: 1.5 }}>
                      {visionResult.summary}
                    </p>
                  </article>

                  {/* Card 2: Violations Card */}
                  <article className="result-card violations-card" style={{ padding: '1.25rem' }}>
                    <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>⚠️ Violations</h3>
                    {visionResult.violations.length === 0 ? (
                      <p style={{ color: 'var(--meta-color)', fontSize: '0.88rem' }}>No violations detected on this road scene.</p>
                    ) : (
                      <div className="stacked-cards" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {visionResult.violations.map((violation, i) => (
                          <div key={i} className="evidence-item" style={{
                            borderLeft: `4px solid ${violation.severity === 'high' ? '#ff3b30' : violation.severity === 'medium' ? '#ffcc00' : '#34c759'}`,
                            padding: '1rem',
                            background: 'rgba(255,255,255,0.02)',
                            borderRadius: '12px',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem' }}>
                              <span style={{ fontWeight: 700, textTransform: 'capitalize', fontSize: '0.95rem', color: violation.severity === 'high' ? '#f87171' : 'var(--text-color)' }}>
                                🚨 {violation.type.replace(/-/g, ' ')}
                              </span>
                              <span className={`severity-badge ${violation.severity}`} style={{ fontSize: '0.8rem', padding: '2px 8px', borderRadius: '10px' }}>
                                {violation.confidence}% confidence
                              </span>
                            </div>
                            
                            <FormattedViolationDetails violation={violation} />

                            {violation.boundingBox && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--meta-color)', fontFamily: 'monospace', marginTop: '0.5rem', textAlign: 'right' }}>
                                Bounding Box: [{violation.boundingBox.join(', ')}]
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </article>

                  {/* Card 3: Detections Card */}
                  <article className="result-card detections-card" style={{ padding: '1.25rem' }}>
                    <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>🔍 Detections</h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--meta-color)', marginBottom: '0.75rem' }}>
                      Raw objects detected by <strong>{visionResult.modelUsed}</strong>. Discarded candidates are highlighted in yellow.
                    </p>
                    {visionResult.rawDetections.length === 0 ? (
                      <p style={{ color: 'var(--meta-color)', fontSize: '0.88rem' }}>No objects detected.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '250px', overflowY: 'auto' }}>
                        {visionResult.rawDetections.map((det, i) => (
                          <div key={i} style={{
                            display: 'grid',
                            gridTemplateColumns: '1.5fr 1fr auto auto',
                            gap: '0.5rem',
                            alignItems: 'center',
                            padding: '0.4rem 0.6rem',
                            borderRadius: '6px',
                            background: det.discarded ? 'rgba(255,204,0,0.06)' : 'rgba(255,255,255,0.02)',
                            border: det.discarded ? '1px solid rgba(255,204,0,0.15)' : 'none',
                            fontSize: '0.78rem'
                          }}>
                            <span style={{ fontWeight: 600, textTransform: 'capitalize', opacity: det.discarded ? 0.6 : 1 }}>
                              {det.label} {det.discarded ? '⚠️' : ''}
                            </span>
                            <span style={{ color: 'var(--meta-color)', fontSize: '0.7rem' }}>
                              {det.detectionSource}
                            </span>
                            <span style={{ fontFamily: 'monospace', color: 'var(--meta-color)', fontSize: '0.7rem' }}>
                              [{det.box.xmin.toFixed(0)},{det.box.ymin.toFixed(0)}→{det.box.xmax.toFixed(0)},{det.box.ymax.toFixed(0)}]
                            </span>
                            <span style={{ fontWeight: 800, textAlign: 'right', minWidth: '40px' }}>
                              {(det.score * 100).toFixed(0)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>

                  {/* Card 4: Performance Metrics Card */}
                  <article className="result-card performance-metrics-card" style={{ padding: '1.25rem' }}>
                    <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>⏱️ Performance Metrics</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem', textAlign: 'center', marginBottom: '0.75rem' }}>
                      {[
                        ['Decode', visionResult.stageTimings?.decodeMs ?? 0],
                        ['YOLOS', visionResult.stageTimings?.yolosMs ?? 0],
                        ['Crop Gen', visionResult.stageTimings?.cropMs ?? 0],
                        ['Classifier', visionResult.stageTimings?.classifierMs ?? 0],
                        ['Total', visionResult.stageTimings?.totalMs ?? 0]
                      ].map(([label, ms]) => (
                        <div key={label as string} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '0.4rem 0.25rem' }}>
                          <div style={{ fontSize: '0.62rem', color: 'var(--meta-color)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.2rem' }}>{label}</div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-color)' }}>{ms}ms</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--meta-color)' }}>
                      <span>Device: CPU ({visionResult.detectionEngine})</span>
                      <span>Total Latency: <strong>{visionResult.inferenceTimeMs ?? visionResult.stageTimings?.totalMs ?? 0} ms</strong></span>
                    </div>
                  </article>

                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--meta-color)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📸</div>
                  <p>Upload a real road photo and click <strong>Run Vision AI Analysis</strong>.</p>
                  <p style={{ fontSize: '0.82rem', marginTop: '0.5rem' }}>
                    Model: <strong>Xenova/yolos-tiny</strong> · Engine: <strong>ONNX Runtime</strong>
                  </p>
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === 'admin' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', width: '100%', alignItems: 'flex-start' }}>
            
            {/* Left side: Rule Search and Source Documents */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: '1 1 350px', minWidth: '300px' }}>
              
              {/* Card 1: Rule Search Card */}
              <article className="result-card rule-search-card" style={{ padding: '1.5rem', background: 'var(--card-bg)', borderRadius: '12px' }}>
                <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>🔍 Rule Search</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
                    Search Term:
                    <input 
                      value={ruleQuery} 
                      onChange={(event) => setRuleQuery(event.target.value)} 
                      placeholder="e.g. speeding, helmet..."
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
                    State Filter:
                    <input 
                      value={ruleStateFilter} 
                      onChange={(event) => setRuleStateFilter(event.target.value)} 
                      placeholder="e.g. DL, HR..."
                    />
                  </label>
                  <button onClick={searchRules} disabled={loading} style={{ width: '100%', borderRadius: '12px', padding: '0.6rem' }}>
                    Search Rules
                  </button>
                  <p className="meta" style={{ fontSize: '0.8rem', color: 'var(--meta-color)', margin: 0 }}>{adminMessage}</p>
                </div>

                {rules.length > 0 && (
                  <div style={{ marginTop: '1.25rem', maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <strong>Search Results ({rules.length}):</strong>
                    {rules.map((rule) => (
                      <div 
                        key={rule.id} 
                        onClick={() => setSelectedRule(rule)}
                        style={{
                          padding: '0.6rem',
                          background: selectedRule?.id === rule.id ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.03)',
                          border: selectedRule?.id === rule.id ? '1px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.05)',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{rule.offenseCode}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--meta-color)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {rule.description}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              {/* Card 4: Source Documents Card */}
              <article className="result-card source-documents-card" style={{ padding: '1.5rem', background: 'var(--card-bg)', borderRadius: '12px' }}>
                <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>📚 Source Documents</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto' }}>
                  {sources.map((source) => (
                    <div key={source.id} style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', fontSize: '0.85rem', border: '1px solid rgba(255,255,255,0.03)' }}>
                      <strong style={{ color: 'var(--accent-color)' }}>{source.organization}</strong>
                      <h4 style={{ margin: '0.2rem 0', fontSize: '0.9rem' }}>{source.name}</h4>
                      <p style={{ margin: '0.2rem 0', fontSize: '0.78rem', color: 'var(--meta-color)' }}>Coverage: {source.coverage}</p>
                      <a href={source.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: 'var(--link-color)', textDecoration: 'none' }}>
                        Open official source portal ↗
                      </a>
                    </div>
                  ))}
                </div>
              </article>

              {/* Database Statistics Card */}
              {adminStats && (
                <article className="result-card stats-card" style={{ padding: '1.5rem', background: 'var(--card-bg)', borderRadius: '12px' }}>
                  <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>📈 Database Statistics</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                    <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                      <span style={{ color: 'var(--meta-color)' }}>Documents:</span> <strong>{adminStats.documentCount}</strong>
                    </div>
                    <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                      <span style={{ color: 'var(--meta-color)' }}>Chunks:</span> <strong>{adminStats.chunkCount}</strong>
                    </div>
                    <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                      <span style={{ color: 'var(--meta-color)' }}>Rules:</span> <strong>{adminStats.ruleCount}</strong>
                    </div>
                    <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                      <span style={{ color: 'var(--meta-color)' }}>Jurisdictions:</span> <strong>{adminStats.jurisdictionCount}</strong>
                    </div>
                    <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                      <span style={{ color: 'var(--meta-color)' }}>Logged Queries:</span> <strong>{adminStats.queryCount}</strong>
                    </div>
                    <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                      <span style={{ color: 'var(--meta-color)' }}>Provenance:</span> <strong>{adminStats.citationCoveragePercent}%</strong>
                    </div>
                  </div>
                </article>
              )}

            </div>

            {/* Right side: Rule Details and Verification Status */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: '2 1 450px', minWidth: '320px' }}>
              
              {selectedRule ? (
                <>
                  {/* Card 2: Rule Details Card */}
                  <article className="result-card rule-details-card" style={{ padding: '1.5rem', background: 'var(--card-bg)', borderRadius: '12px' }}>
                    <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>📋 Rule Details</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.88rem', marginBottom: '1.25rem' }}>
                      <div><span style={{ color: 'var(--meta-color)' }}>Offense Code:</span> <span style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>{selectedRule.offenseCode}</span></div>
                      <div><span style={{ color: 'var(--meta-color)' }}>Jurisdiction (State):</span> {selectedRule.stateCode}</div>
                      <div><span style={{ color: 'var(--meta-color)' }}>Vehicle Class:</span> {selectedRule.vehicleClass}</div>
                      <div><span style={{ color: 'var(--meta-color)' }}>Effective Date:</span> {selectedRule.effectiveFrom ? new Date(selectedRule.effectiveFrom).toLocaleDateString() : '—'}</div>
                      <div><span style={{ color: 'var(--meta-color)' }}>Base Fine:</span> INR {selectedRule.baseFine}</div>
                      <div><span style={{ color: 'var(--meta-color)' }}>Compounding Fine:</span> INR {selectedRule.compoundingFine}</div>
                      <div style={{ gridColumn: 'span 2' }}><span style={{ color: 'var(--meta-color)' }}>Demerit Points:</span> {selectedRule.demeritPoints} pts</div>
                    </div>
                    <div style={{ fontSize: '0.88rem', marginBottom: '1.25rem' }}>
                      <strong>Description:</strong>
                      <p style={{ background: 'rgba(0,0,0,0.15)', padding: '0.75rem', borderRadius: '8px', marginTop: '0.35rem', lineHeight: 1.45 }}>
                        {selectedRule.description}
                      </p>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--meta-color)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem' }}>
                      <strong>Provenance Source:</strong><br />
                      URL: <a href={selectedRule.sourceReference.sourceUrl} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all', color: 'var(--link-color)' }}>{selectedRule.sourceReference.sourceUrl}</a><br />
                      Clause: {selectedRule.sourceReference.sourceClause || '—'} · Page: {selectedRule.sourceReference.pageNumber}
                    </div>
                  </article>

                  {/* Card 3: Verification Status Card */}
                  <article className="result-card verification-status-card" style={{ padding: '1.5rem', background: 'var(--card-bg)', borderRadius: '12px' }}>
                    <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>🛡️ Verification Status</h3>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                      <span style={{ fontSize: '0.9rem', color: 'var(--meta-color)' }}>Current Status:</span>
                      <span className={`status-badge ${selectedRule.verificationStatus || 'needs-review'}`} style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        fontSize: '0.8rem',
                        background: selectedRule.verificationStatus === 'approved' ? 'rgba(74, 222, 128, 0.2)' : selectedRule.verificationStatus === 'rejected' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 193, 7, 0.2)',
                        color: selectedRule.verificationStatus === 'approved' ? '#4ade80' : selectedRule.verificationStatus === 'rejected' ? '#ef4444' : '#ffc107'
                      }}>
                        {selectedRule.verificationStatus || 'needs-review'}
                      </span>
                    </div>

                    {selectedRule.verifiedBy && (
                      <div style={{ fontSize: '0.85rem', color: 'var(--meta-color)', background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '6px', marginBottom: '1.25rem', border: '1px solid rgba(255,255,255,0.03)' }}>
                        <div><strong>Verified By:</strong> {selectedRule.verifiedBy}</div>
                        <div><strong>Verified At:</strong> {selectedRule.verifiedAt ? new Date(selectedRule.verifiedAt).toLocaleString() : '—'}</div>
                        {selectedRule.verificationNotes && <div style={{ marginTop: '0.25rem' }}><strong>Notes:</strong> {selectedRule.verificationNotes}</div>}
                      </div>
                    )}

                    <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Update Verification</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1rem' }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
                          Verified By:
                          <input value={verifiedBy} onChange={(event) => setVerifiedBy(event.target.value)} />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
                          Notes / Remarks:
                          <input value={verificationNotes} onChange={(event) => setVerificationNotes(event.target.value)} />
                        </label>
                      </div>
                      
                      <div className="button-row" style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                        <button onClick={() => verifyRule(selectedRule.id, 'approved')} disabled={loading} style={{ background: '#22c55e', color: '#fff', borderRadius: '8px', padding: '0.5rem 1rem' }}>
                          ✅ Approve Rule
                        </button>
                        <button onClick={() => verifyRule(selectedRule.id, 'needs-review')} disabled={loading} style={{ background: '#eab308', color: '#000', borderRadius: '8px', padding: '0.5rem 1rem' }}>
                          ⚠️ Needs Review
                        </button>
                        <button onClick={() => verifyRule(selectedRule.id, 'rejected')} disabled={loading} style={{ background: '#ef4444', color: '#fff', borderRadius: '8px', padding: '0.5rem 1rem' }}>
                          ❌ Reject / Flag
                        </button>
                      </div>
                    </div>
                  </article>
                </>
              ) : (
                <article className="result-card" style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--meta-color)', borderRadius: '12px' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
                  <p>Select a rule from the search results to view details and update verification status.</p>
                </article>
              )}

            </div>
          </div>
        )}

        {activeTab === 'benchmark' && (
          <section className="panel judge-dashboard full-width">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>AI Evaluation Dashboard</h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={exportBenchmarkJSON}>⬇ Export JSON</button>
                <button onClick={() => window.print()}>🖨 Print / PDF</button>
              </div>
            </div>

            {/* Model Info Header */}
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', gap: '2rem', fontSize: '0.9rem' }}>
              <div><span style={{ color: 'var(--meta-color)' }}>Current Model:</span> Multi-Stage (YOLOS + ResNet50)</div>
              <div><span style={{ color: 'var(--meta-color)' }}>Model Version:</span> 2.0.0 (Production)</div>
              <div><span style={{ color: 'var(--meta-color)' }}>Inference Device:</span> CPU (ONNX Runtime)</div>
              <div><span style={{ color: 'var(--meta-color)' }}>Avg Latency:</span> {realEvalStats ? realEvalStats.averageLatencyMs.toFixed(0) : 0} ms</div>
            </div>

            {/* If no dataset run yet, display the placeholder message */}
            {benchmarkLoading ? (
              <div className="loading-dataset-message" style={{
                padding: '4rem 3rem',
                textAlign: 'center',
                background: 'rgba(255,255,255,0.02)',
                border: '1px dashed var(--accent-color)',
                borderRadius: '20px',
                color: 'var(--text-color)',
                fontSize: '1.2rem',
                margin: '2rem 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1.25rem'
              }}>
                <div className="spinner" style={{
                  width: '40px',
                  height: '40px',
                  border: '4px solid rgba(255, 255, 255, 0.1)',
                  borderTop: '4px solid var(--accent-color)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                <style>{`
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                `}</style>
                <strong style={{ color: 'var(--text-color)' }}>Running AI Test Suite and Edge Inference...</strong>
                <span style={{ fontSize: '0.88rem', color: 'var(--meta-color)', maxWidth: '400px', lineHeight: 1.5 }}>
                  Currently running Xenova/yolos-tiny and ResNet50 over the benchmark image dataset to measure precision, recall, and F1-score. This may take up to a minute.
                </span>
              </div>
            ) : !realEvalStats || realEvalStats.imagesEvaluated === 0 ? (
              <div className="no-dataset-message" style={{
                padding: '3rem',
                textAlign: 'center',
                background: 'rgba(255,255,255,0.02)',
                border: '1px dashed rgba(255,255,255,0.1)',
                borderRadius: '12px',
                color: 'var(--meta-color)',
                fontSize: '1.1rem',
                margin: '2rem 0'
              }}>
                📂 Upload evaluation dataset to generate metrics.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', width: '100%', marginBottom: '2rem' }}>
                
                {/* Card 1: Dataset Metrics */}
                <article className="result-card dataset-metrics-card" style={{ padding: '1.5rem', background: 'var(--card-bg)', borderRadius: '12px' }}>
                  <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>📊 Dataset Metrics</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', textAlign: 'center' }}>
                    <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--meta-color)', textTransform: 'uppercase', fontWeight: 600 }}>Accuracy</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--eyebrow-color)' }}>
                        {(((realEvalStats.truePositives + realEvalStats.trueNegatives) / realEvalStats.imagesEvaluated) * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--meta-color)', textTransform: 'uppercase', fontWeight: 600 }}>Precision</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--eyebrow-color)' }}>
                        {(realEvalStats.precision * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--meta-color)', textTransform: 'uppercase', fontWeight: 600 }}>Recall</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--eyebrow-color)' }}>
                        {(realEvalStats.recall * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--meta-color)', textTransform: 'uppercase', fontWeight: 600 }}>F1 Score</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--eyebrow-color)' }}>
                        {(realEvalStats.f1 * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--meta-color)', textTransform: 'uppercase', fontWeight: 600 }}>Avg Latency</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--eyebrow-color)' }}>
                        {realEvalStats.averageLatencyMs.toFixed(0)} ms
                      </div>
                    </div>
                    <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--meta-color)', textTransform: 'uppercase', fontWeight: 600 }}>Avg Confidence</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--eyebrow-color)' }}>
                        {((realEvalStats.averageConfidence || 0.85) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </article>

                {/* Card 2: Confusion Matrix */}
                <article className="result-card confusion-matrix-card" style={{ padding: '1.5rem', background: 'var(--card-bg)', borderRadius: '12px' }}>
                  <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>🔲 Confusion Matrix</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', textAlign: 'center', marginTop: '0.5rem' }}>
                    <div style={{ padding: '0.75rem', background: 'rgba(74, 222, 128, 0.1)', border: '1px solid rgba(74, 222, 128, 0.2)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.7rem', color: '#4ade80', fontWeight: 'bold' }}>TRUE POSITIVE (TP)</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#4ade80' }}>{realEvalStats.truePositives}</div>
                    </div>
                    <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 'bold' }}>FALSE POSITIVE (FP)</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ef4444' }}>{realEvalStats.falsePositives}</div>
                    </div>
                    <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 'bold' }}>FALSE NEGATIVE (FN)</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ef4444' }}>{realEvalStats.falseNegatives}</div>
                    </div>
                    <div style={{ padding: '0.75rem', background: 'rgba(74, 222, 128, 0.1)', border: '1px solid rgba(74, 222, 128, 0.2)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.7rem', color: '#4ade80', fontWeight: 'bold' }}>TRUE NEGATIVE (TN)</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#4ade80' }}>{realEvalStats.trueNegatives}</div>
                    </div>
                  </div>
                </article>

                {/* Card 3: Evaluation Summary */}
                <article className="result-card evaluation-summary-card" style={{ padding: '1.5rem', background: 'var(--card-bg)', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', width: '100%' }}>📈 Evaluation Summary</h3>
                  <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', width: '100%', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <svg width="120" height="120" viewBox="0 0 200 200">
                      <defs>
                        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#10b981" />
                          <stop offset="100%" stopColor="#06b6d4" />
                        </linearGradient>
                      </defs>
                      <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="16" />
                      <circle cx="100" cy="100" r="80" fill="none" stroke="url(#gradient)" strokeWidth="16" strokeDasharray="502" strokeDashoffset={502 - (502 * (realEvalStats?.f1 || 0))} strokeLinecap="round" transform="rotate(-90 100 100)" style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
                      <text x="100" y="110" textAnchor="middle" fill="var(--text-color)" fontSize="28" fontWeight="bold">
                        {(realEvalStats.f1 * 100).toFixed(0)}%
                      </text>
                      <text x="100" y="135" textAnchor="middle" fill="var(--meta-color)" fontSize="14">F1 Score</text>
                    </svg>
                    <div style={{ flex: 1, fontSize: '0.85rem', lineHeight: 1.4, minWidth: '150px' }}>
                      <div>Total Evaluated: <strong>{realEvalStats.imagesEvaluated}</strong></div>
                      <div>Success Rate: <strong>{(((realEvalStats.truePositives + realEvalStats.trueNegatives) / realEvalStats.imagesEvaluated) * 100).toFixed(1)}%</strong></div>
                      <div style={{ marginTop: '0.5rem', color: 'var(--meta-color)' }}>
                        Performance index verified against benchmark test datasets.
                      </div>
                    </div>
                  </div>
                </article>

              </div>
            )}

            {/* Suite Controls */}
            <div className="suite-controls" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              <h4 style={{ margin: '0 0.5rem 0 0' }}>Test Suites:</h4>
              <button onClick={() => runBenchmarkSuite('Helmet')} disabled={benchmarkLoading}>Helmet Suite</button>
              <button onClick={() => runBenchmarkSuite('Seatbelt')} disabled={benchmarkLoading}>Seatbelt Suite</button>
              <button onClick={() => runBenchmarkSuite('Road Hazard')} disabled={benchmarkLoading}>Road Hazard Suite</button>
              <button onClick={() => runBenchmarkSuite('Traffic')} disabled={benchmarkLoading}>Traffic Suite</button>
              <button onClick={() => {
                ['Helmet', 'Seatbelt', 'Road Hazard', 'Traffic'].forEach((s, i) => setTimeout(() => runBenchmarkSuite(s as SuiteType), i * 1500));
              }} disabled={benchmarkLoading} style={{ background: 'var(--eyebrow-color)' }}>
                Run Full Benchmark
              </button>
            </div>

            {/* Benchmark History Table */}
            {benchmarkCases.length > 0 && (
              <div style={{ overflowX: 'auto', marginTop: '1rem', background: 'var(--card-bg)', borderRadius: '12px', padding: '1rem' }}>
                <table className="failure-analysis-table">
                  <thead>
                    <tr>
                      <th>Image</th>
                      <th>Ground Truth</th>
                      <th>Prediction</th>
                      <th>Conf.</th>
                      <th>Result</th>
                      <th>Explainability Trace (Fusion)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benchmarkCases.map(c => (
                      <tr key={c.id}>
                        <td>
                          <img src={c.imageSrc} alt="benchmark" style={{ width: '60px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />
                        </td>
                        <td style={{ fontWeight: 600 }}>{c.groundTruth}</td>
                        <td>{c.prediction || 'None'}</td>
                        <td>{((c.confidence || 0) * 100).toFixed(1)}%</td>
                        <td>
                          <span style={{ padding: '2px 8px', borderRadius: '12px', background: c.isCorrect ? 'rgba(74, 222, 128, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: c.isCorrect ? '#4ade80' : '#ef4444', fontWeight: 600 }}>
                            {c.isCorrect ? '✅ PASS' : '❌ FAIL'}
                          </span>
                        </td>
                        <td style={{ maxWidth: '250px', fontSize: '0.75rem' }}>
                          {!c.isCorrect && (
                             <div style={{ color: '#ef4444', marginBottom: '0.5rem', fontWeight: 600 }}>
                               Reason: {c.confidence && c.confidence < 0.5 ? 'Confidence fell below threshold.' : 'Fusion logic discarded raw candidate.'}
                             </div>
                          )}
                          <details>
                            <summary style={{ cursor: 'pointer', color: 'var(--link-color)' }}>View Trace</summary>
                            <div style={{ marginTop: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '6px' }}>
                              <div style={{ color: 'var(--meta-color)', marginBottom: '0.2rem', fontWeight: 700 }}>YOLOS:</div>
                              {c.rawAnalysisResult?.rawDetections.filter(d => d.detectionSource === 'Xenova/yolos-tiny').map((d, i) => <div key={i}>- {d.label} ({(d.score * 100).toFixed(0)}%)</div>)}
                              {c.rawAnalysisResult?.rawDetections.filter(d => d.detectionSource === 'Xenova/yolos-tiny').length === 0 && <div>(None)</div>}
                              
                              <div style={{ color: 'var(--meta-color)', marginTop: '0.5rem', marginBottom: '0.2rem', fontWeight: 700 }}>OWL-ViT:</div>
                              {c.rawAnalysisResult?.owlViTDiagnostics?.slice(0, 3).map((d, i) => <div key={i}>- {d.prompt} ({(d.confidence * 100).toFixed(0)}%)</div>)}
                            </div>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
        {activeTab === 'calculator' && (
          <section className="panel full-width">
            <h2>Challan Calculator</h2>
            <div className="two-col" style={{ marginBottom: '2rem' }}>
              <div className="card-item" style={{ padding: '1.5rem', background: 'var(--card-bg)' }}>
                <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>Configure Input</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <label>
                    State:
                    <select value={calcStateCode} onChange={e => setCalcStateCode(e.target.value)}>
                      {STATE_LOCATIONS.map(loc => (
                        <option key={loc.code} value={loc.code}>{loc.name}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Vehicle Type:
                    <select value={calcVehicleClass} onChange={e => setCalcVehicleClass(e.target.value)}>
                      <option value="LMV">Light Motor Vehicle (Car)</option>
                      <option value="TWO_WHEELER">Two Wheeler</option>
                      <option value="HMV">Heavy Motor Vehicle</option>
                      <option value="COMMERCIAL">Commercial / Taxi</option>
                    </select>
                  </label>

                  <div style={{ position: 'relative' }}>
                    <label>
                      Offense Search:
                      <input 
                        type="text" 
                        placeholder="Search offenses (e.g. speed, helmet)..." 
                        value={calcSearchQuery} 
                        onChange={e => setCalcSearchQuery(e.target.value)} 
                      />
                    </label>
                    {calcSearchResults.length > 0 && (
                      <div className="suggestions-dropdown">
                        {calcSearchResults.map(rule => (
                          <div 
                            key={rule.id} 
                            className="suggestion-item"
                            onClick={() => {
                              setCalcSelectedOffense(rule);
                              setCalcSearchQuery('');
                              setCalcSearchResults([]);
                            }}
                          >
                            <strong>{rule.offenseCode}</strong>: {rule.description}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {calcSelectedOffense && (
                    <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid var(--card-border)' }}>
                      <strong>Selected Offense:</strong><br />
                      <span style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>{calcSelectedOffense.offenseCode}</span> - {calcSelectedOffense.description}
                    </div>
                  )}

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <input type="checkbox" checked={calcRepeatOffense} onChange={e => setCalcRepeatOffense(e.target.checked)} />
                    Repeat Offense (increases penalty in some cases)
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" checked={calcCommercial} onChange={e => setCalcCommercial(e.target.checked)} />
                    Driver Category: Commercial Duty (may trigger compound rates)
                  </label>

                  <button 
                    onClick={runCalculator} 
                    disabled={calcLoading || !calcSelectedOffense}
                    style={{ 
                      marginTop: '1rem', 
                      padding: '0.75rem 1.5rem', 
                      fontSize: '1.1rem',
                      background: (!calcSelectedOffense) ? 'rgba(255,255,255,0.08)' : 'var(--accent-color)',
                      color: (!calcSelectedOffense) ? 'var(--meta-color)' : '#fff',
                      cursor: (!calcSelectedOffense) ? 'not-allowed' : 'pointer',
                      opacity: (!calcSelectedOffense) ? 0.5 : 1,
                      transition: 'all 0.3s ease',
                      fontWeight: 700
                    }}
                  >
                    {calcLoading ? '⏳ Calculating...' : !calcSelectedOffense ? '🔍 Select an offense first' : '⚡ Calculate Fines'}
                  </button>
                </div>
              </div>

              <div className="card-item" style={{ padding: '1.5rem', background: 'var(--card-bg)' }}>
                <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>Official Calculation Result</h3>
                
                {!calcResult ? (
                  <p style={{ color: 'var(--meta-color)' }}>Select inputs and calculate to view the official challan breakdown.</p>
                ) : (
                  <div className="professional-challan-invoice" style={{
                    background: 'linear-gradient(135deg, rgba(20, 30, 48, 0.95), rgba(36, 59, 85, 0.95))',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                    backdropFilter: 'blur(10px)',
                    color: '#f3f4f6',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.25rem'
                  }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem' }}>
                      <div>
                        <h4 style={{ margin: 0, color: 'var(--accent-color)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Official Traffic Violation Notice</h4>
                        <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.2rem', fontWeight: 700 }}>Challan Fine Assessment</h3>
                      </div>
                      <span style={{ fontSize: '1.5rem' }}>⚖️</span>
                    </div>

                    {/* Metadata Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem', background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px' }}>
                      <div><span style={{ color: 'var(--meta-color)' }}>Jurisdiction (State):</span> <strong>{STATE_NAMES[calcResult.stateCode] || calcResult.stateCode}</strong></div>
                      <div><span style={{ color: 'var(--meta-color)' }}>Vehicle Class:</span> <strong>{VEHICLE_LABELS[calcResult.vehicleClass?.toUpperCase()] || calcResult.vehicleClass}</strong></div>
                    </div>

                    {/* Itemized List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {calcResult.items.map((item, idx) => (
                        <div key={idx} style={{
                          background: 'rgba(0, 0, 0, 0.25)',
                          borderLeft: '4px solid #f59e0b',
                          padding: '0.85rem',
                          borderRadius: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem'
                        }}>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>
                            {item.description}
                          </div>
                          
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--meta-color)' }}>
                            <div><strong>Violation Code:</strong> {item.offenseCode}</div>
                            <div><strong>Applicable Law Section:</strong> {item.sourceClause || '—'}</div>
                            <div><strong>Base Fine:</strong> {fmtInr(item.baseFine)}</div>
                            <div><strong>Compounding Fine:</strong> {fmtInr(item.compoundingFine)}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Modifiers & Adjustments (Repeat Offence Impact) */}
                    {(calcResult.adjustments > 0 || calcRepeatOffense || calcCommercial) && (
                      <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.85rem', borderRadius: '8px', fontSize: '0.82rem' }}>
                        <strong style={{ color: '#f87171', display: 'block', marginBottom: '0.25rem' }}>⚡ Repeat Offence & Modifiers Impact</strong>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--meta-color)' }}>
                          <span>Repeat Offence Multipier (50%):</span>
                          <span style={{ color: '#f87171', fontWeight: 'bold' }}>{calcRepeatOffense ? `+${fmtInr(calcResult.subtotal * 0.5)}` : '—'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--meta-color)', marginTop: '0.2rem' }}>
                          <span>Commercial Duty Surcharge (10%):</span>
                          <span style={{ color: '#f87171', fontWeight: 'bold' }}>{calcCommercial ? `+${fmtInr(calcResult.subtotal * 0.1)}` : '—'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.4rem', marginTop: '0.4rem', fontWeight: 'bold' }}>
                          <span>Total Modifier Surcharge:</span>
                          <span style={{ color: '#f87171' }}>+{fmtInr(calcResult.adjustments)}</span>
                        </div>
                      </div>
                    )}

                    {/* Total Summary */}
                    <div style={{
                      marginTop: '0.5rem',
                      paddingTop: '1rem',
                      borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <span style={{ color: 'var(--meta-color)' }}>Total Payable Amount</span>
                        <div style={{ fontSize: '0.75rem', color: 'var(--meta-color)' }}>(Base Fine + Compounding + Surcharges)</div>
                      </div>
                      <strong style={{ fontSize: '2rem', color: '#10b981', textShadow: '0 0 10px rgba(16, 185, 129, 0.2)' }}>
                        {fmtInr(calcResult.total)}
                      </strong>
                    </div>

                    {/* System Warnings */}
                    {calcResult.warnings && calcResult.warnings.length > 0 && (
                      <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '3px solid #ef4444', borderRadius: '4px' }}>
                        <strong>System Warnings:</strong>
                        <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
                          {calcResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                      <button onClick={generateCalculatorPdf} disabled={calcLoading} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', background: 'var(--accent-color)', color: 'var(--bg-color)', fontWeight: 'bold' }}>
                        📄 Generate QR Challan PDF
                      </button>
                      <button onClick={() => window.print()} style={{ padding: '0.6rem 1rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        🖨 Print Summary
                      </button>
                    </div>

                    {calcPdfUrl && (
                      <div style={{ marginTop: '0.5rem', textAlign: 'center' }}>
                        <a href={calcPdfUrl} download="calculated_challan.pdf" className="download-link" style={{ display: 'block', padding: '0.6rem', background: '#10b981', color: '#fff', textDecoration: 'none', borderRadius: '8px', fontWeight: 'bold' }}>
                          ⬇ Download Official PDF
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
