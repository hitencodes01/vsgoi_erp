-- AlterTable
ALTER TABLE `Lecture` ADD COLUMN `suspendReason` VARCHAR(200) NULL,
    ADD COLUMN `suspended` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `Coordinator` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `teacherId` INTEGER NOT NULL,
    `sessionId` INTEGER NOT NULL,
    `courseId` INTEGER NOT NULL,
    `departmentId` INTEGER NULL,
    `semester` INTEGER NOT NULL,
    `section` VARCHAR(1) NOT NULL,

    INDEX `Coordinator_teacherId_sessionId_idx`(`teacherId`, `sessionId`),
    INDEX `Coordinator_sessionId_courseId_departmentId_semester_idx`(`sessionId`, `courseId`, `departmentId`, `semester`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Coordinator` ADD CONSTRAINT `Coordinator_teacherId_fkey` FOREIGN KEY (`teacherId`) REFERENCES `Teacher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Coordinator` ADD CONSTRAINT `Coordinator_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Coordinator` ADD CONSTRAINT `Coordinator_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Coordinator` ADD CONSTRAINT `Coordinator_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
