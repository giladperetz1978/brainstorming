interface Window {
  localAI: {
    status: () => Promise<{ configured: boolean }>
    setKey: (value: string) => Promise<{ configured: boolean; ok?: boolean; error?: string }>
    research: (topic: string) => Promise<{ configured: boolean; ok?: boolean; text?: string; error?: string; sources?: Array<{ title?: string; uri?: string }> }>
    generate: (prompt: string) => Promise<{ configured: boolean; ok?: boolean; text?: string; error?: string }>
  }
}