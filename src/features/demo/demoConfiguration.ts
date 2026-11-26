// Build-time presentation only. This never grants private Worker authority.
export const staticDemoConfiguration = {
  environment: 'demo',
  localHelper: false,
  demoHelper: true,
  turnstileRequired: false,
  turnstileSiteKey: null,
} as const;
