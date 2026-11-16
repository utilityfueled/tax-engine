ARG BASE
FROM ${BASE}
USER root
ARG EXPECTED_ARCH
ARG SOURCE_MANIFEST_SHA
LABEL io.vivalatax.candidate-release-qualified="false" \
      io.vivalatax.risk-accepted="false" \
      io.vivalatax.glibc-source-manifest-sha256="${SOURCE_MANIFEST_SHA}"
COPY runtime-packages /usr/local/share/vivalatax/glibc-private/packages
COPY install-runtime.sh /usr/local/share/vivalatax/glibc-private/install-runtime.sh
RUN EXPECTED_ARCH="$EXPECTED_ARCH" /bin/bash /usr/local/share/vivalatax/glibc-private/install-runtime.sh
# Inherit the official PostgreSQL entrypoint, CMD, environment and runtime user.
