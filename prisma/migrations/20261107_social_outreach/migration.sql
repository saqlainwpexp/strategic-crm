-- AlterTable
ALTER TABLE `Lead` ADD COLUMN `connectionDegree` VARCHAR(8) NULL,
    ADD COLUMN `followerCount` INTEGER NULL,
    ADD COLUMN `industry` VARCHAR(191) NULL,
    ADD COLUMN `jobTitle` VARCHAR(191) NULL,
    ADD COLUMN `location` VARCHAR(191) NULL,
    ADD COLUMN `primaryChannel` VARCHAR(20) NULL;

-- CreateTable
CREATE TABLE `LeadSocialProfile` (
    `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default',
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(20) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `key` VARCHAR(300) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LeadSocialProfile_agencyId_idx`(`agencyId`),
    INDEX `LeadSocialProfile_leadId_idx`(`leadId`),
    UNIQUE INDEX `LeadSocialProfile_agencyId_platform_key_key`(`agencyId`, `platform`, `key`),
    UNIQUE INDEX `LeadSocialProfile_agencyId_leadId_platform_key`(`agencyId`, `leadId`, `platform`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OutreachThread` (
    `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default',
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `platform` VARCHAR(20) NOT NULL,
    `threadUrl` VARCHAR(500) NULL,
    `stage` ENUM('not_contacted', 'connection_sent', 'connected', 'message_sent', 'replied', 'interested', 'call_booked', 'won', 'lost', 'not_interested', 'no_response') NOT NULL DEFAULT 'not_contacted',
    `connectionSentAt` DATETIME(3) NULL,
    `connectionAcceptedAt` DATETIME(3) NULL,
    `firstMessageAt` DATETIME(3) NULL,
    `lastOutboundAt` DATETIME(3) NULL,
    `lastInboundAt` DATETIME(3) NULL,
    `followupCount` INTEGER NOT NULL DEFAULT 0,
    `nextFollowupAt` DATETIME(3) NULL,
    `replySentiment` ENUM('positive', 'neutral', 'negative', 'objection') NULL,
    `templateId` VARCHAR(191) NULL,
    `campaignId` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OutreachThread_agencyId_idx`(`agencyId`),
    INDEX `OutreachThread_ownerId_idx`(`ownerId`),
    INDEX `OutreachThread_stage_idx`(`stage`),
    INDEX `OutreachThread_nextFollowupAt_idx`(`nextFollowupAt`),
    INDEX `OutreachThread_campaignId_idx`(`campaignId`),
    UNIQUE INDEX `OutreachThread_agencyId_leadId_platform_key`(`agencyId`, `leadId`, `platform`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OutreachActivity` (
    `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default',
    `id` VARCHAR(191) NOT NULL,
    `threadId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `platform` VARCHAR(20) NOT NULL,
    `direction` ENUM('outbound', 'inbound') NOT NULL,
    `type` ENUM('connection_request', 'dm', 'comment', 'like', 'story_reply', 'voice_note') NOT NULL,
    `messageText` TEXT NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OutreachActivity_agencyId_idx`(`agencyId`),
    INDEX `OutreachActivity_threadId_idx`(`threadId`),
    INDEX `OutreachActivity_userId_platform_occurredAt_idx`(`userId`, `platform`, `occurredAt`),
    INDEX `OutreachActivity_occurredAt_idx`(`occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OutreachTemplate` (
    `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default',
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(20) NOT NULL,
    `body` TEXT NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OutreachTemplate_agencyId_idx`(`agencyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OutreachCampaign` (
    `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default',
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(20) NOT NULL,
    `audience` TEXT NULL,
    `templateId` VARCHAR(191) NULL,
    `startDate` DATETIME(3) NULL,
    `dailyLimit` INTEGER NULL,
    `goal` TEXT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OutreachCampaign_agencyId_idx`(`agencyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialAccount` (
    `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default',
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(20) NOT NULL,
    `handle` VARCHAR(191) NOT NULL DEFAULT '',
    `dailyConnectionLimit` INTEGER NOT NULL DEFAULT 20,
    `dailyDmLimit` INTEGER NOT NULL DEFAULT 50,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SocialAccount_agencyId_idx`(`agencyId`),
    UNIQUE INDEX `SocialAccount_agencyId_userId_platform_key`(`agencyId`, `userId`, `platform`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LeadSocialProfile` ADD CONSTRAINT `LeadSocialProfile_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OutreachThread` ADD CONSTRAINT `OutreachThread_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OutreachThread` ADD CONSTRAINT `OutreachThread_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OutreachThread` ADD CONSTRAINT `OutreachThread_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `OutreachTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OutreachThread` ADD CONSTRAINT `OutreachThread_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `OutreachCampaign`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OutreachActivity` ADD CONSTRAINT `OutreachActivity_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `OutreachThread`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OutreachActivity` ADD CONSTRAINT `OutreachActivity_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OutreachTemplate` ADD CONSTRAINT `OutreachTemplate_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OutreachCampaign` ADD CONSTRAINT `OutreachCampaign_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `OutreachTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialAccount` ADD CONSTRAINT `SocialAccount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

