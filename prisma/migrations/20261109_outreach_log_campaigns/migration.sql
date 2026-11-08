-- AlterTable
ALTER TABLE `LogContact` ADD COLUMN `campaignId` VARCHAR(191) NULL,
    ADD COLUMN `tags` VARCHAR(500) NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE `LogCampaign` (
    `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default',
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `name` VARCHAR(120) NOT NULL,
    `color` VARCHAR(16) NOT NULL DEFAULT '#EA8B5E',
    `description` VARCHAR(500) NOT NULL DEFAULT '',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LogCampaign_agencyId_idx`(`agencyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `LogContact_campaignId_idx` ON `LogContact`(`campaignId`);

-- AddForeignKey
ALTER TABLE `LogContact` ADD CONSTRAINT `LogContact_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `LogCampaign`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LogCampaign` ADD CONSTRAINT `LogCampaign_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

