-- Keep identity unique within a roster, allow it in any other team/category.
CREATE UNIQUE INDEX `StaffParticipant_teamId_documentType_documentNumber_key`
ON `StaffParticipant` (`teamId`, `documentType`, `documentNumber`);
CREATE INDEX `StaffParticipant_eventId_category_idx` ON `StaffParticipant` (`eventId`, `category`);
DROP INDEX `StaffParticipant_eventId_category_documentType_documentNumbe_key` ON `StaffParticipant`;
