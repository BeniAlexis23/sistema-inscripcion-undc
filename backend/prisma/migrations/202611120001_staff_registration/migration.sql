-- CreateTable
CREATE TABLE `StaffEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `opensAt` DATETIME(3) NOT NULL,
    `closesAt` DATETIME(3) NOT NULL,
    `basesUrl` VARCHAR(2048) NULL,
    `formatsUrl` VARCHAR(2048) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffTeam` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `eventId` INTEGER NOT NULL,
    `category` VARCHAR(30) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `dependency` VARCHAR(200) NOT NULL,
    `workplace` VARCHAR(150) NOT NULL,
    `mixedDependencies` BOOLEAN NOT NULL DEFAULT false,
    `delegate` JSON NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'OBSERVED', 'APPROVED') NOT NULL DEFAULT 'SUBMITTED',
    `receiptCode` VARCHAR(36) NOT NULL,
    `editTokenHash` VARCHAR(64) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `StaffTeam_receiptCode_key`(`receiptCode`),
    INDEX `StaffTeam_eventId_category_status_receivedAt_idx`(`eventId`, `category`, `status`, `receivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffParticipant` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `teamId` INTEGER NOT NULL,
    `eventId` INTEGER NOT NULL,
    `category` VARCHAR(30) NOT NULL,
    `position` INTEGER NOT NULL,
    `firstName` VARCHAR(100) NOT NULL,
    `lastName` VARCHAR(150) NOT NULL,
    `documentType` VARCHAR(10) NOT NULL,
    `documentNumber` VARCHAR(20) NOT NULL,
    `sex` ENUM('FEMALE', 'MALE') NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `employment` VARCHAR(20) NOT NULL,
    `dependency` VARCHAR(200) NOT NULL,

    UNIQUE INDEX `StaffParticipant_eventId_category_documentType_documentNumbe_key`(`eventId`, `category`, `documentType`, `documentNumber`),
    UNIQUE INDEX `StaffParticipant_teamId_position_key`(`teamId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffDocument` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `teamId` INTEGER NOT NULL,
    `field` VARCHAR(40) NOT NULL,
    `originalName` VARCHAR(255) NOT NULL,
    `storageName` VARCHAR(100) NOT NULL,
    `mime` VARCHAR(60) NOT NULL,
    `size` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StaffDocument_storageName_key`(`storageName`),
    UNIQUE INDEX `StaffDocument_teamId_field_key`(`teamId`, `field`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffReview` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `teamId` INTEGER NOT NULL,
    `actorId` INTEGER NOT NULL,
    `actorName` VARCHAR(150) NOT NULL,
    `action` VARCHAR(30) NOT NULL,
    `notes` TEXT NOT NULL,
    `checks` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StaffTeam` ADD CONSTRAINT `StaffTeam_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `StaffEvent`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffParticipant` ADD CONSTRAINT `StaffParticipant_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `StaffTeam`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffDocument` ADD CONSTRAINT `StaffDocument_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `StaffTeam`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffReview` ADD CONSTRAINT `StaffReview_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `StaffTeam`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

