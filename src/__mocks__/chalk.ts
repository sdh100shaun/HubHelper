// Mock implementation of chalk for testing
// Returns input string unchanged, supports method chaining

const mockChalk: any = (str: any): string => String(str);

// Add chainable properties that all point back to mockChalk
mockChalk.bold = mockChalk;
mockChalk.cyan = mockChalk;
mockChalk.red = mockChalk;
mockChalk.yellow = mockChalk;
mockChalk.green = mockChalk;
mockChalk.blue = mockChalk;
mockChalk.gray = mockChalk;
mockChalk.white = mockChalk;
mockChalk.magenta = mockChalk;

export default mockChalk;
