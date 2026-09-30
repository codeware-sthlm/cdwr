/** The dist-tag the global setup publishes the build under test with */
export const LOCAL_PLUGIN_TAG = 'e2e';

/**
 * The plugin as the local registry serves the build under test.
 *
 * Without the tag a workspace asks for `latest`, which the local registry
 * passes through to npm, and the suites test what is already published.
 */
export const LOCAL_PLUGIN = `@cdwr/nx-payload@${LOCAL_PLUGIN_TAG}`;
