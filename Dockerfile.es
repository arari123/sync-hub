FROM docker.elastic.co/elasticsearch/elasticsearch:8.10.4

RUN elasticsearch-plugin install analysis-nori
