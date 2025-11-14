# Build stage
FROM golang:1.25.1-alpine AS builder

# Install build dependencies
RUN apk add --no-cache gcc musl-dev sqlite-dev

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o satplan .

# Runtime stage
FROM alpine:3.9

# Install runtime dependencies
RUN apk --no-cache add ca-certificates sqlite-libs

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
