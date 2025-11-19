# Build stage
FROM golang:1.25.1-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application (CGO disabled - using pure Go SQLite)
RUN CGO_ENABLED=0 GOOS=linux go build -a -ldflags="-w -s" -o satplan .

# Runtime stage
FROM alpine:3.9

# Install runtime dependencies
RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Copy the binary from builder
COPY --from=builder /app/satplan .

# Copy static files and database initialization
COPY static ./static
COPY init.sql ./

# Create data directory for SQLite database
RUN mkdir -p /root/data

# Expose port
EXPOSE 8080

# Run the application
CMD ["./satplan"]
