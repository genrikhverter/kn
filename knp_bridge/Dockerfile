FROM python:3.12-slim

WORKDIR /app

COPY requirements/ requirements/
RUN pip install --no-cache-dir -r requirements/prod.txt

COPY app/ app/
COPY start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]
