FROM node:latest AS builder
WORKDIR /app
COPY . .
RUN yarn
# RUN yarn prisma generate
RUN yarn build


FROM node:lts-alpine AS production
WORKDIR /app
COPY --from=builder /app/package.json .
COPY --from=builder /app/dist .
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 8000
CMD ["yarn", "start:prod"]