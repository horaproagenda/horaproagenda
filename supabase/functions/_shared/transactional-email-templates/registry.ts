/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as verificationCode } from './verification-code.tsx'
import { template as accountStatusUpdate } from './account-status-update.tsx'
import { template as contactChangeCode } from './contact-change-code.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'verification-code': verificationCode,
  'account-status-update': accountStatusUpdate,
  'contact-change-code': contactChangeCode,
}
