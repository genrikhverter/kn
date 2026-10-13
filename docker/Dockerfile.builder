FROM registry.red-soft.ru/ubi8/openjdk-21

USER root

RUN dnf install -y java-11-openjdk-devel git curl tar && dnf clean all

# симлинки pack200 — нужны сборке desktop-client (упаковка JWS-артефактов)
RUN ln -s /usr/lib/jvm/java-11-openjdk/bin/pack200 /usr/bin/pack200 && \
    ln -s /usr/lib/jvm/java-11-openjdk/bin/unpack200 /usr/bin/unpack200

# Maven — с российского зеркала GitVerse (замена Maven Central)
RUN curl -fSL https://mvn-mirror.gitverse.ru/org/apache/maven/apache-maven/3.9.6/apache-maven-3.9.6-bin.tar.gz -o /tmp/maven.tar.gz && \
    tar -xzf /tmp/maven.tar.gz -C /opt/ && \
    rm /tmp/maven.tar.gz && \
    ln -s /opt/apache-maven-3.9.6 /opt/maven

ENV JAVA_HOME_21=/usr/lib/jvm/java-21-openjdk
ENV JAVA_HOME_11=/usr/lib/jvm/java-11-openjdk
ENV JAVA_HOME=$JAVA_HOME_21
ENV M2_HOME=/opt/maven
ENV PATH=$JAVA_HOME/bin:$M2_HOME/bin:$PATH

# все зависимости Maven — только через зеркало GitVerse
RUN mkdir -p /root/.m2 && \
    cat <<EOF > /root/.m2/settings.xml
<settings>
  <mirrors>
    <mirror>
      <id>gitverse-mirror</id>
      <name>Gitverse Maven Mirror</name>
      <url>https://mvn-mirror.gitverse.ru/</url>
      <mirrorOf>central</mirrorOf>
    </mirror>
    <mirror>
      <id>lsfusion-ru-mirror</id>
      <name>LSFusion RU Mirror</name>
      <url>https://repo.lsfusion.ru</url>
      <mirrorOf>lsfusion</mirrorOf>
    </mirror>
  </mirrors>
</settings>
EOF

WORKDIR /build
