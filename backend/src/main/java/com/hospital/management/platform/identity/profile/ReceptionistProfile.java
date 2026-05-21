package com.hospital.management.platform.identity.profile;

import java.util.List;

public record ReceptionistProfile(List<String> tills) implements ProfileData {
}
