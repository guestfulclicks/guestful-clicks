const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// @supabase/supabase-js v2.106+ includes an OpenTelemetry tracing module that
// uses dynamic import() with a variable argument, which Hermes cannot compile.
// Alias it to an empty module so the tracing code is a no-op at runtime.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@opentelemetry/api': require.resolve('./otel-stub.js'),
};

module.exports = config;
