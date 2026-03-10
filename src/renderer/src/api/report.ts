import request from '../utils/request'

export interface SubmitFeedbackParams {
  type: 'feature_request' | 'bug_report' | 'ai_content'
  reason: string
  detail?: string
  contact?: string
}

export interface SubmitFeedbackResult {
  id: number
}

export function submitFeedback(params: SubmitFeedbackParams): Promise<SubmitFeedbackResult> {
  return request({
    url: '/api/feedback',
    method: 'post',
    data: params
  })
}
