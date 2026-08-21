module.exports = {
  apps: [
    {
      name: 'sdr-saas-core',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3030,
        HOST: '0.0.0.0',
      },
    },
  ],
};
