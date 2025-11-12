import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['renderer/app.js'],
  bundle: true,
  outfile: 'renderer/dist/app.bundle.js',
  platform: 'browser',
  target: 'es2020',
  sourcemap: true,
  minify: false,
  logLevel: 'info'
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('🔄 Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  console.log('✓ Build complete');
}
