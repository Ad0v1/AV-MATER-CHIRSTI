// ESQUEMA MAESTRO — BORRADOR PARA REVISION EN SPRINT 0
// NO ejecutar migraciones ni reemplazar el schema activo desde este archivo.
// Los nombres, tipos, relaciones y defaults son PROPUESTAS tecnicas.
// Fuente funcional: ERS Aula Virtual Institucional v1.0; Plan de Trabajo 13/10/2026.
// Validar Prisma version y prisma.config.ts con Dev 1 antes de adaptarlo al repositorio.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  STUDENT
  TEACHER
  ADMIN
  GUARDIAN
}

enum UserStatus {
  ACTIVE
  INACTIVE
  WITHDRAWN
}

enum AcademicPeriodKind {
  FIRST_BIMESTER
  SECOND_BIMESTER
  THIRD_TRIMESTER
  FOURTH_TRIMESTER
}

enum MaterialKind {
  CLASS
  READING
}

enum ScanStatus {
  PENDING_UPLOAD
  PENDING_SCAN
  CLEAN
  REJECTED
}

enum GradeState {
  GRADED
  NE
  EXEMPT
}

enum JobState {
  QUEUED
  RUNNING
  SUCCEEDED
  FAILED
}

// DEV 2: usuarios. DEV 1 controla autenticacion, credenciales, politica, audit.
model User {
  id                 String              @id @default(uuid())
  institutionalEmail String              @unique
  fullName           String
  role               UserRole
  status             UserStatus          @default(ACTIVE)
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt
  localCredential    LocalCredential?
  policyAcceptances  PolicyAcceptance[]
  taughtCourseSections CourseSection[]   @relation("CourseTeacher")
  enrollments        Enrollment[]        @relation("EnrollmentStudent")
  guardianLinks      GuardianStudent[]   @relation("GuardianLink")
  studentLinks       GuardianStudent[]   @relation("StudentLink")
  publishedMaterials Material[]          @relation("MaterialAuthor")
  createdAssignments Assignment[]        @relation("AssignmentAuthor")
  uploadedFiles      StoredFile[]        @relation("FileUploader")
  gradedBy           Grade[]             @relation("GradeGrader")
  auditLogs          AuditLog[]          @relation("AuditActor")
  notifications      Notification[]      @relation("RecipientNotifications")
  uploadIntents      UploadIntent[]      @relation("UploaderIntent")

  @@index([role, status])
}

model LocalCredential {
  userId              String @id
  passwordHash        String
  totpSecretEncrypted String?
  user                User   @relation(fields: [userId], references: [id])
}

model PolicyAcceptance {
  id            String   @id @default(uuid())
  userId        String
  policyVersion String
  acceptedAt    DateTime @default(now())
  user          User     @relation(fields: [userId], references: [id])

  @@unique([userId, policyVersion])
}

model GuardianStudent {
  guardianId String
  studentId  String
  guardian   User   @relation("GuardianLink", fields: [guardianId], references: [id])
  student    User   @relation("StudentLink", fields: [studentId], references: [id])

  @@id([guardianId, studentId])
}

// DEV 2: estructura academica y matriculas historicas
model AcademicYear {
  id          String           @id @default(uuid())
  year        Int              @unique
  isActive    Boolean          @default(false)
  periods     AcademicPeriod[]
  sections    Section[]
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
}

model AcademicPeriod {
  id             String             @id @default(uuid())
  academicYearId String
  sequence       Int
  kind           AcademicPeriodKind
  label          String
  startsAt       DateTime
  endsAt         DateTime
  closedAt       DateTime?
  academicYear   AcademicYear       @relation(fields: [academicYearId], references: [id])
  assignments    Assignment[]
  materials      Material[]

  @@unique([academicYearId, sequence])
  @@index([closedAt])
}

model Section {
  id             String          @id @default(uuid())
  academicYearId String
  gradeLevel     Int
  code           String
  isActive       Boolean         @default(true)
  academicYear   AcademicYear    @relation(fields: [academicYearId], references: [id])
  enrollments    Enrollment[]
  courseSections CourseSection[]

  @@unique([academicYearId, gradeLevel, code])
}

model Course {
  id             String          @id @default(uuid())
  name           String
  isActive       Boolean         @default(true)
  courseSections CourseSection[]
}

model CourseSection {
  id           String       @id @default(uuid())
  sectionId    String
  courseId     String
  teacherId    String
  section      Section      @relation(fields: [sectionId], references: [id])
  course       Course       @relation(fields: [courseId], references: [id])
  teacher      User         @relation("CourseTeacher", fields: [teacherId], references: [id])
  materials    Material[]
  assignments  Assignment[]
  announcements Announcement[]

  @@unique([sectionId, courseId])
  @@index([teacherId])
}

model Enrollment {
  id            String             @id @default(uuid())
  studentId     String
  sectionId     String
  effectiveFrom DateTime           @default(now())
  effectiveTo   DateTime?
  student       User               @relation("EnrollmentStudent", fields: [studentId], references: [id])
  section       Section            @relation(fields: [sectionId], references: [id])
  submissions   Submission[]
  grades        Grade[]

  @@index([studentId, effectiveTo])
  @@index([sectionId])
}

// DEV 3: contenidos, tareas, entregas, archivos
model StoredFile {
  id                String              @id @default(uuid())
  objectKey         String              @unique
  originalName      String
  mimeType          String
  sizeBytes         Int
  sha256            String?
  scanStatus        ScanStatus          @default(PENDING_UPLOAD)
  uploadedById      String
  uploadedAt        DateTime            @default(now())
  scannedAt         DateTime?
  uploadedBy        User                @relation("FileUploader", fields: [uploadedById], references: [id])
  materials         Material[]          @relation("MaterialPdf")
  assignmentAttachments Assignment[]    @relation("AssignmentAttachment")
  submissionVersions SubmissionVersion[] @relation("SubmissionPdf")
  uploadIntents     UploadIntent[]

  @@index([scanStatus])
}

model UploadIntent {
  id          String     @id @default(uuid())
  uploadedById String
  fileId      String
  expiresAt   DateTime
  completedAt DateTime?
  idempotencyKey String? @unique
  uploadedBy  User       @relation("UploaderIntent", fields: [uploadedById], references: [id])
  file        StoredFile @relation(fields: [fileId], references: [id])
}

model Material {
  id              String         @id @default(uuid())
  courseSectionId String
  periodId        String?
  kind            MaterialKind
  title           String
  description     String?        @db.Text
  fileId          String
  isReusable      Boolean        @default(false)
  deletedAt       DateTime?
  createdById     String
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  courseSection   CourseSection  @relation(fields: [courseSectionId], references: [id])
  period          AcademicPeriod? @relation(fields: [periodId], references: [id])
  file            StoredFile     @relation("MaterialPdf", fields: [fileId], references: [id])
  createdBy       User           @relation("MaterialAuthor", fields: [createdById], references: [id])

  @@index([courseSectionId, kind, deletedAt])
}

model Assignment {
  id                 String       @id @default(uuid())
  courseSectionId    String
  periodId           String
  title              String
  instructions       String       @db.Text
  dueAt              DateTime
  maxSizeBytes       Int          @default(20971520) // Propuesta MiB; confirmar MB con la institución
  noSubmissionGrade  Decimal      @default(0) @db.Decimal(4, 2)
  allowLate          Boolean      @default(false)
  attachmentFileId   String?
  deletedAt          DateTime?
  createdById        String
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt
  courseSection      CourseSection @relation(fields: [courseSectionId], references: [id])
  period             AcademicPeriod @relation(fields: [periodId], references: [id])
  attachmentFile     StoredFile?   @relation("AssignmentAttachment", fields: [attachmentFileId], references: [id])
  createdBy          User         @relation("AssignmentAuthor", fields: [createdById], references: [id])
  submissions        Submission[]
  grades             Grade[]

  @@index([courseSectionId, periodId, dueAt])
}

model Submission {
  id            String             @id @default(uuid())
  assignmentId  String
  enrollmentId  String
  createdAt     DateTime           @default(now())
  assignment    Assignment         @relation(fields: [assignmentId], references: [id])
  enrollment    Enrollment         @relation(fields: [enrollmentId], references: [id])
  versions      SubmissionVersion[]

  @@unique([assignmentId, enrollmentId])
}

model SubmissionVersion {
  id            String     @id @default(uuid())
  submissionId  String
  versionNumber Int
  fileId        String     @unique
  receivedAt    DateTime
  isLate        Boolean
  submission    Submission @relation(fields: [submissionId], references: [id])
  file          StoredFile @relation("SubmissionPdf", fields: [fileId], references: [id])

  @@unique([submissionId, versionNumber])
}

// DEV 4: la fuente de verdad de notas, NE, exoneraciones
model Grade {
  id              String      @id @default(uuid())
  assignmentId    String
  enrollmentId    String
  state           GradeState
  value           Decimal?    @db.Decimal(4, 2)
  feedback        String?     @db.Text
  exemptionReason String?     @db.Text
  gradedById      String?
  gradedAt        DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  assignment      Assignment  @relation(fields: [assignmentId], references: [id])
  enrollment      Enrollment  @relation(fields: [enrollmentId], references: [id])
  gradedBy        User?       @relation("GradeGrader", fields: [gradedById], references: [id])

  @@unique([assignmentId, enrollmentId])
}

// DEV 5: anuncios, notificaciones y configuracion; DEV 1: bitacora
model Announcement {
  id              String         @id @default(uuid())
  courseSectionId String?
  title           String
  body            String         @db.Text
  createdAt       DateTime       @default(now())
  courseSection   CourseSection? @relation(fields: [courseSectionId], references: [id])
  // Alcance institucional/por grado/curso: definir schema final con Dev 5.
}

model Notification {
  id          String    @id @default(uuid())
  recipientId String
  kind        String
  message     String    @db.Text
  readAt      DateTime?
  createdAt   DateTime  @default(now())
  recipient   User      @relation("RecipientNotifications", fields: [recipientId], references: [id])
}

model InstitutionSetting {
  key       String   @id
  value     Json
  updatedAt DateTime @updatedAt
}

model AuditLog {
  id          String   @id @default(uuid())
  actorId     String?
  action      String
  module      String
  ip          String?
  beforeState Json?
  afterState  Json?
  occurredAt  DateTime @default(now())
  actor       User?    @relation("AuditActor", fields: [actorId], references: [id])
  // La inmutabilidad se exige por politica de acceso de aplicacion e infra.
}

model BackgroundJob {
  id         String   @id @default(uuid())
  kind       String
  entityId   String?
  status     JobState @default(QUEUED)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  // BullMQ/Redis es la infraestructura real; esta entidad de control es opcional.
}
