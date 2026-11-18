ARG BASE
FROM ${BASE}
COPY remove-runtime-packages.sh /usr/local/sbin/tax-engine-minimize-postgres-runtime
RUN /bin/sh /usr/local/sbin/tax-engine-minimize-postgres-runtime /usr/local/share/tax-engine-runtime-inventory \
    && rm /usr/local/sbin/tax-engine-minimize-postgres-runtime
LABEL io.vivalatax.qualification="private-minimal-postgres-runtime-candidate" \
      io.vivalatax.candidate-release-qualified="false" \
      io.vivalatax.risk-accepted="false"
