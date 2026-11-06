ALTER TABLE `Team`
  DROP FOREIGN KEY `Team_delegateId_fkey`;
ALTER TABLE `Team`
  MODIFY `delegateId` INTEGER NULL,
  ADD COLUMN `delegateName` VARCHAR(150) NULL,
  ADD COLUMN `delegateDni` VARCHAR(8) NULL,
  ADD COLUMN `delegatePhone` VARCHAR(20) NULL,
  ADD COLUMN `delegateEmail` VARCHAR(191) NULL,
  ADD COLUMN `receiptCode` VARCHAR(36) NULL;
CREATE UNIQUE INDEX `Team_receiptCode_key` ON `Team`(`receiptCode`);
ALTER TABLE `Team` ADD CONSTRAINT `Team_delegateId_fkey` FOREIGN KEY (`delegateId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Audit` DROP FOREIGN KEY `Audit_actorId_fkey`;
ALTER TABLE `Audit` MODIFY `actorId` INTEGER NULL;
ALTER TABLE `Audit` ADD CONSTRAINT `Audit_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
