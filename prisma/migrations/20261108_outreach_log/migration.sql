-- CreateTable
CREATE TABLE `LogAccount` (
    `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default',
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(20) NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `handle` VARCHAR(255) NOT NULL DEFAULT '',
    `dailyLimit` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LogAccount_agencyId_idx`(`agencyId`),
    INDEX `LogAccount_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LogContact` (
    `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default',
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `name` VARCHAR(200) NOT NULL,
    `company` VARCHAR(200) NOT NULL DEFAULT '',
    `title` VARCHAR(200) NOT NULL DEFAULT '',
    `channel` VARCHAR(20) NOT NULL,
    `accountId` VARCHAR(191) NULL,
    `handle` VARCHAR(500) NOT NULL DEFAULT '',
    `handleKey` VARCHAR(500) NOT NULL DEFAULT '',
    `stage` VARCHAR(20) NOT NULL DEFAULT 'new',
    `followupCount` INTEGER NOT NULL DEFAULT 0,
    `lastOutboundAt` DATETIME(3) NULL,
    `lastInboundAt` DATETIME(3) NULL,
    `nextFollowupAt` DATETIME(3) NULL,
    `signaledAt` DATETIME(3) NULL,
    `source` VARCHAR(120) NOT NULL DEFAULT '',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LogContact_agencyId_idx`(`agencyId`),
    INDEX `LogContact_ownerId_idx`(`ownerId`),
    INDEX `LogContact_stage_idx`(`stage`),
    INDEX `LogContact_nextFollowupAt_idx`(`nextFollowupAt`),
    INDEX `LogContact_handleKey_idx`(`handleKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JobApplication` (
    `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default',
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `title` VARCHAR(200) NOT NULL,
    `company` VARCHAR(200) NOT NULL DEFAULT '',
    `source` VARCHAR(40) NOT NULL,
    `url` VARCHAR(1000) NOT NULL DEFAULT '',
    `location` VARCHAR(200) NOT NULL DEFAULT '',
    `salary` VARCHAR(120) NOT NULL DEFAULT '',
    `accountId` VARCHAR(191) NULL,
    `contactName` VARCHAR(200) NOT NULL DEFAULT '',
    `contactInfo` VARCHAR(255) NOT NULL DEFAULT '',
    `stage` VARCHAR(20) NOT NULL DEFAULT 'applied',
    `appliedAt` DATETIME(3) NULL,
    `interviewAt` DATETIME(3) NULL,
    `followupCount` INTEGER NOT NULL DEFAULT 0,
    `lastOutboundAt` DATETIME(3) NULL,
    `lastInboundAt` DATETIME(3) NULL,
    `nextFollowupAt` DATETIME(3) NULL,
    `signaledAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `JobApplication_agencyId_idx`(`agencyId`),
    INDEX `JobApplication_ownerId_idx`(`ownerId`),
    INDEX `JobApplication_stage_idx`(`stage`),
    INDEX `JobApplication_nextFollowupAt_idx`(`nextFollowupAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LogActivity` (
    `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default',
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `contactId` VARCHAR(191) NULL,
    `jobId` VARCHAR(191) NULL,
    `accountId` VARCHAR(191) NULL,
    `type` VARCHAR(30) NOT NULL,
    `direction` VARCHAR(10) NOT NULL DEFAULT 'none',
    `text` TEXT NULL,
    `fromStage` VARCHAR(20) NULL,
    `toStage` VARCHAR(20) NULL,
    `byAgent` BOOLEAN NOT NULL DEFAULT false,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LogActivity_agencyId_idx`(`agencyId`),
    INDEX `LogActivity_contactId_idx`(`contactId`),
    INDEX `LogActivity_jobId_idx`(`jobId`),
    INDEX `LogActivity_accountId_occurredAt_idx`(`accountId`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LogAccount` ADD CONSTRAINT `LogAccount_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LogContact` ADD CONSTRAINT `LogContact_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LogContact` ADD CONSTRAINT `LogContact_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `LogAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobApplication` ADD CONSTRAINT `JobApplication_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobApplication` ADD CONSTRAINT `JobApplication_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `LogAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LogActivity` ADD CONSTRAINT `LogActivity_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LogActivity` ADD CONSTRAINT `LogActivity_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `LogContact`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LogActivity` ADD CONSTRAINT `LogActivity_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `JobApplication`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LogActivity` ADD CONSTRAINT `LogActivity_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `LogAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

