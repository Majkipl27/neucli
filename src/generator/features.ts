import type { Config, AnalysisResult } from './types.ts';

export function analyzeFeatures(config: Config): AnalysisResult {
  const features = {
    routing: (config.pages && config.pages.length > 1) || false,
  };

  const dependencies: Record<string, string> = {
    ...config.dependencies
  };

  if (features.routing) {
    dependencies['react-router-dom'] = '^7.1.0';
  }

  return { features, dependencies };
}
