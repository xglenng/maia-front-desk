export function maySendStudioSms(complianceStatus: string, nodeEnvironment = process.env.NODE_ENV) {
  return complianceStatus === 'APPROVED' || (nodeEnvironment !== 'production' && complianceStatus === 'MOCK_APPROVED');
}