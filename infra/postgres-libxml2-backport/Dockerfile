ARG BASE
FROM ${BASE}
USER root
ARG EXPECTED_ARCH
ARG DEBIAN_MULTIARCH
ARG SOURCE_MANIFEST_SHA
COPY runtime-package.deb /qualification/libxml2.deb
RUN test "$(dpkg --print-architecture)" = "$EXPECTED_ARCH" && \
    dpkg -i /qualification/libxml2.deb && \
    dpkg-query -W -f='${binary:Package}\t${Version}\t${Architecture}\n' > /qualification/packages.tsv && \
    sha256sum "/usr/lib/$DEBIAN_MULTIARCH/libxml2.so.2.9.14" > /qualification/provider.sha256
LABEL io.vivalatax.qualification="private-libxml2-backport-candidate" \
      io.vivalatax.candidate-release-qualified="false" \
      io.vivalatax.risk-accepted="false" \
      io.vivalatax.source-manifest-sha256="${SOURCE_MANIFEST_SHA}"
