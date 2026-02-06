/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "whats-v2",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
      providers: {
        aws: {
          profile: "next-dev",
        },
      },
    };
  },
  async run() {
    const vpc = new sst.aws.Vpc("vpc-main-iac");
    const qrCodeBucket = new sst.aws.Bucket("WhatsAppQrcodes");

    const tokenBucket = new sst.aws.Bucket("WhatsAppTokens");

    const cluster = new sst.aws.Cluster("next-whats-api-cluster", {
      vpc,
    });

    const fileSystem = new sst.aws.Efs("WhatsApp-FileSystem", {
      vpc,
    });

    new sst.aws.Service("next-whats-api", {
      cluster,
      cpu: "2 vCPU",
      memory: "4 GB",
      image: {
        context: ".",
        dockerfile: "Dockerfile",
      },
      scaling: {
        min: 1, // Only 1 instance - WhatsApp allows only one active session per number
        max: 4, // Cannot scale WhatsApp sessions horizontally
        cpuUtilization: 80,
        memoryUtilization: 80,
      },
      capacity: {
        fargate: { weight: 1, base: 1 }, // Use Fargate for reliability (single instance)
        spot: { weight: 0 },
      },
      loadBalancer: {
        rules: [
          {
            listen: "80/http",
            forward: "3000/http",
          },
        ],
        idle: "300000 seconds", // 5 minutes to match WhatsApp auth timeout
      },
      link: [qrCodeBucket, tokenBucket],
      dev: {
        command: "pnpm run local",
      },
    });
  },
});
