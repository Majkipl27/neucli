export function analyzeFeatures(config) {
  const features = {
    routing: (config.pages && config.pages.length > 1) || false,
  };

  const dependencies = {
    ...config.dependencies
  };

  if (features.routing) {
    dependencies['react-router-dom'] = '^7.1.0';
  }

  return { features, dependencies };
}
