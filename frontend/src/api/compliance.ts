import client from './client'

export interface ComplianceFramework {
  id: number
  name: string
  description?: string
  version?: string
  total_controls: number
  compliant_controls: number
  compliance_pct: number
}

export interface ComplianceControl {
  id: number
  control_id: string
  title: string
  description?: string
  category?: string
  status: string
  evidence?: string
  notes?: string
  assessed_at?: string
  next_review?: string
  assessment_id?: number
}

export interface ComplianceSummary {
  total_frameworks: number
  total_controls: number
  compliant_controls: number
  overall_compliance_pct: number
}

export interface RetentionPolicy {
  id: number
  data_type: string
  retention_days: number
  auto_delete: boolean
}

export const complianceApi = {
  frameworks: () => client.get<ComplianceFramework[]>('/compliance/frameworks'),
  controls: (frameworkId: number) => client.get<ComplianceControl[]>(`/compliance/frameworks/${frameworkId}/controls`),
  updateAssessment: (controlId: number, data: { status: string; evidence?: string; notes?: string; next_review?: string }) =>
    client.put(`/compliance/controls/${controlId}/assessment`, data),
  retentionPolicies: () => client.get<RetentionPolicy[]>('/compliance/retention-policies'),
  createRetentionPolicy: (data: Partial<RetentionPolicy>) => client.post('/compliance/retention-policies', data),
  summary: () => client.get<ComplianceSummary>('/compliance/summary'),
}
