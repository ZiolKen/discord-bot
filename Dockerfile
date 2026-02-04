FROM ubuntu:24.04 AS build
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
  build-essential cmake git pkg-config ca-certificates \
  libssl-dev zlib1g-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
RUN cmake --build build -j
RUN strip build/bot || true

FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates libssl3 zlib1g \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/build/bot /app/bot

ENV PORT=3000
CMD ["/app/bot"]
