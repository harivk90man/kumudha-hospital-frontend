package com.hospital.management.platform.identity;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.UUID;

@Service
public class JwtService {

    @Value("${hms.auth.jwt-secret}")
    private String secret;

    @Value("${hms.auth.token-expiry-hours:8}")
    private int tokenExpiryHours;

    public String generateToken(User user) {
        OffsetDateTime expiry = expiryTime();
        return Jwts.builder()
                .subject(user.getId().toString())
                .claim("username", user.getUsername())
                .claim("status",   user.getStatus().dbValue())
                .claim("tv",       user.getTokenVersion())
                .issuedAt(new Date())
                .expiration(Date.from(expiry.toInstant()))
                .signWith(signingKey())
                .compact();
    }

    public int extractTokenVersion(String token) {
        return parse(token).get("tv", Integer.class);
    }

    public Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(signingKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public UUID extractUserId(String token) {
        return UUID.fromString(parse(token).getSubject());
    }

    public OffsetDateTime expiryTime() {
        return OffsetDateTime.now().plusHours(tokenExpiryHours);
    }

    /** Returns the expiry embedded in an existing token without issuing a new one. */
    public OffsetDateTime expiryTimeFromToken(String token) {
        return parse(token).getExpiration()
                .toInstant()
                .atOffset(ZoneOffset.UTC);
    }

    private SecretKey signingKey() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }
}
