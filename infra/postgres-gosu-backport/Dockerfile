ARG BASE
FROM ${BASE}
USER root
ARG EXPECTED_ARCH
ARG SOURCE_MANIFEST_SHA
ARG GOSU_SHA256
COPY gosu /usr/local/bin/gosu
COPY LICENSE /usr/local/share/doc/gosu/LICENSE
COPY THIRD-PARTY-LICENSES.txt /usr/local/share/doc/gosu/THIRD-PARTY-LICENSES.txt
RUN test "$(dpkg --print-architecture)" = "$EXPECTED_ARCH" && \
    echo "$GOSU_SHA256  /usr/local/bin/gosu" | sha256sum --check --strict && \
    chmod 0755 /usr/local/bin/gosu && chown 0:0 /usr/local/bin/gosu && \
    test "$(/usr/local/bin/gosu --version)" = "1.20 (go1.27.4 on linux/$EXPECTED_ARCH; gc)" && \
    test "$(/usr/local/bin/gosu postgres id -u)" = "$(id -u postgres)"
LABEL io.vivalatax.qualification="private-gosu-rebuild-candidate" \
      io.vivalatax.candidate-release-qualified="false" \
      io.vivalatax.risk-accepted="false" \
      io.vivalatax.source-manifest-sha256="${SOURCE_MANIFEST_SHA}" \
      io.vivalatax.gosu-sha256="${GOSU_SHA256}"
