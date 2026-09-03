---
title: AWS Certified Solutions Architect - Associate
issuer: Amazon Web Services (AWS)
date: 2023-04
expires: 2026-04
url: https://aws.amazon.com/verification
credential_id: AWS-SAA-987654
image: /images/certificates/aws-saa.png
logo: /images/organizations/aws.svg
skills:
  - Cloud Architecture
  - AWS
  - DevOps
---

Covers designing available, fault-tolerant and cost-aware systems on AWS. The exam is broader
than it is deep: it rewards knowing which service to reach for far more than knowing any one
of them thoroughly.

## What it actually covers

| Domain | Weight | In practice |
|---|---:|---|
| Design resilient architectures | 30% | Multi-AZ, failover, decoupling with queues |
| High-performing architectures | 28% | Caching layers, read replicas, storage classes |
| Secure applications | 24% | IAM policies, encryption at rest and in transit |
| Cost-optimised architectures | 18% | Instance purchasing, lifecycle rules, egress |

The cost domain is the one most people under-prepare and the one that comes up most often at
work.

## Preparation notes

- Build things rather than read about them. A VPC diagram makes sense the moment you have
  debugged a subnet that could not reach the internet because the route table was wrong.
- Set a billing alarm before studying, not after. Ask me why.
- The practice exams are calibrated harder than the real thing, which is the right direction
  for a practice exam to be wrong in.
