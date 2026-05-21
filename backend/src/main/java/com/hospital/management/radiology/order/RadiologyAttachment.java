package com.hospital.management.radiology.order;

import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.util.Objects;
import java.util.UUID;

/**
 * DICOM image or PDF attached to a radiology order. CASCADE child of radiology_orders.
 * fileData stores raw bytes in the DB. Migration path: add fileUrl text column
 * and move large files to S3/object store, keeping fileData NULL.
 * fileType: image/jpeg | image/png | application/pdf
 */
@Entity
@Table(name = "radiology_attachments")
@Getter
public class RadiologyAttachment extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID radiologyOrderId;

    @Column(nullable = false, updatable = false)
    private String fileName;

    @Column(nullable = false, updatable = false)
    private String fileType;

    @Column(nullable = false)
    private byte[] fileData;

    @Column(nullable = false)
    private int fileSizeBytes;

    @Setter @Column
    private String caption;

    @Column(nullable = false)
    private int sequenceNo;

    protected RadiologyAttachment() {}

    public RadiologyAttachment(UUID radiologyOrderId, String fileName, String fileType,
                               byte[] fileData, int fileSizeBytes, int sequenceNo, UUID createdBy) {
        this.radiologyOrderId = radiologyOrderId;
        this.fileName         = fileName;
        this.fileType         = fileType;
        this.fileData         = fileData;
        this.fileSizeBytes    = fileSizeBytes;
        this.sequenceNo       = sequenceNo;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof RadiologyAttachment a)) return false;
        return Objects.equals(id, a.id);
    }

    @Override
    public int hashCode() { return Objects.hash(id); }
}
