#!/bin/bash
set -e

npm install
npx prisma generate
npx prisma db push --accept-data-loss
