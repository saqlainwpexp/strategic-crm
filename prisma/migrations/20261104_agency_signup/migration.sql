-- DropIndex
DROP INDEX `CustomFieldDef_key_key` ON `CustomFieldDef`;

-- DropIndex
DROP INDEX `EmailAccount_email_key` ON `EmailAccount`;

-- DropIndex
DROP INDEX `EmailDomain_domain_key` ON `EmailDomain`;

-- DropIndex
DROP INDEX `LiProspect_linkedinUrl_key` ON `LiProspect`;

-- DropIndex
DROP INDEX `Payment_invoiceNo_key` ON `Payment`;

-- DropIndex
DROP INDEX `Pool_name_key` ON `Pool`;

-- AlterTable
ALTER TABLE `AuditLog` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `Automation` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `AutomationEnrollment` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `CallLog` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `Campaign` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `CsvImport` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `CustomFieldDef` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `EmailAccount` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `EmailDomain` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `EmailSend` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `EmailTemplate` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `InboxMessage` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `InboxThread` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `Lead` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `LiAccount` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `LiAction` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `LiCampaign` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `LiCampaignProspect` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `LiConversation` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `LiMessage` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `LiProspect` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `LiTemplate` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `Meeting` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `Payment` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `Pool` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `Script` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `Setting` DROP PRIMARY KEY,
    ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default',
    ADD PRIMARY KEY (`agencyId`, `key`);

-- AlterTable
ALTER TABLE `TimeLog` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE `User` ADD COLUMN `agencyId` VARCHAR(191) NOT NULL DEFAULT 'default';

-- CreateTable
CREATE TABLE `Agency` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SignupLimit` (
    `key` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `SignupLimit_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `AuditLog_agencyId_idx` ON `AuditLog`(`agencyId`);

-- CreateIndex
CREATE INDEX `Automation_agencyId_idx` ON `Automation`(`agencyId`);

-- CreateIndex
CREATE INDEX `AutomationEnrollment_agencyId_idx` ON `AutomationEnrollment`(`agencyId`);

-- CreateIndex
CREATE INDEX `CallLog_agencyId_idx` ON `CallLog`(`agencyId`);

-- CreateIndex
CREATE INDEX `Campaign_agencyId_idx` ON `Campaign`(`agencyId`);

-- CreateIndex
CREATE INDEX `CsvImport_agencyId_idx` ON `CsvImport`(`agencyId`);

-- CreateIndex
CREATE INDEX `CustomFieldDef_agencyId_idx` ON `CustomFieldDef`(`agencyId`);

-- CreateIndex
CREATE UNIQUE INDEX `CustomFieldDef_agencyId_key_key` ON `CustomFieldDef`(`agencyId`, `key`);

-- CreateIndex
CREATE INDEX `EmailAccount_agencyId_idx` ON `EmailAccount`(`agencyId`);

-- CreateIndex
CREATE UNIQUE INDEX `EmailAccount_agencyId_email_key` ON `EmailAccount`(`agencyId`, `email`);

-- CreateIndex
CREATE INDEX `EmailDomain_agencyId_idx` ON `EmailDomain`(`agencyId`);

-- CreateIndex
CREATE UNIQUE INDEX `EmailDomain_agencyId_domain_key` ON `EmailDomain`(`agencyId`, `domain`);

-- CreateIndex
CREATE INDEX `EmailSend_agencyId_idx` ON `EmailSend`(`agencyId`);

-- CreateIndex
CREATE INDEX `EmailTemplate_agencyId_idx` ON `EmailTemplate`(`agencyId`);

-- CreateIndex
CREATE INDEX `InboxMessage_agencyId_idx` ON `InboxMessage`(`agencyId`);

-- CreateIndex
CREATE INDEX `InboxThread_agencyId_idx` ON `InboxThread`(`agencyId`);

-- CreateIndex
CREATE INDEX `Lead_agencyId_idx` ON `Lead`(`agencyId`);

-- CreateIndex
CREATE INDEX `LiAccount_agencyId_idx` ON `LiAccount`(`agencyId`);

-- CreateIndex
CREATE INDEX `LiAction_agencyId_idx` ON `LiAction`(`agencyId`);

-- CreateIndex
CREATE INDEX `LiCampaign_agencyId_idx` ON `LiCampaign`(`agencyId`);

-- CreateIndex
CREATE INDEX `LiCampaignProspect_agencyId_idx` ON `LiCampaignProspect`(`agencyId`);

-- CreateIndex
CREATE INDEX `LiConversation_agencyId_idx` ON `LiConversation`(`agencyId`);

-- CreateIndex
CREATE INDEX `LiMessage_agencyId_idx` ON `LiMessage`(`agencyId`);

-- CreateIndex
CREATE INDEX `LiProspect_agencyId_idx` ON `LiProspect`(`agencyId`);

-- CreateIndex
CREATE UNIQUE INDEX `LiProspect_agencyId_linkedinUrl_key` ON `LiProspect`(`agencyId`, `linkedinUrl`);

-- CreateIndex
CREATE INDEX `LiTemplate_agencyId_idx` ON `LiTemplate`(`agencyId`);

-- CreateIndex
CREATE INDEX `Meeting_agencyId_idx` ON `Meeting`(`agencyId`);

-- CreateIndex
CREATE INDEX `Payment_agencyId_idx` ON `Payment`(`agencyId`);

-- CreateIndex
CREATE UNIQUE INDEX `Payment_agencyId_invoiceNo_key` ON `Payment`(`agencyId`, `invoiceNo`);

-- CreateIndex
CREATE INDEX `Pool_agencyId_idx` ON `Pool`(`agencyId`);

-- CreateIndex
CREATE UNIQUE INDEX `Pool_agencyId_name_key` ON `Pool`(`agencyId`, `name`);

-- CreateIndex
CREATE INDEX `Script_agencyId_idx` ON `Script`(`agencyId`);

-- CreateIndex
CREATE INDEX `Setting_agencyId_idx` ON `Setting`(`agencyId`);

-- CreateIndex
CREATE INDEX `TimeLog_agencyId_idx` ON `TimeLog`(`agencyId`);

-- CreateIndex
CREATE INDEX `User_agencyId_idx` ON `User`(`agencyId`);

INSERT INTO Agency (id, name, active, createdAt) VALUES ('default', 'Strategic Core Solutions', true, NOW());
