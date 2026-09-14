-- Add invite / open-access settings to marketplace lessons.
--   accessMode: 'enrolled' (paying students only) | 'open' (anyone with the link, optional passcode)
--   passcode:   optional PIN a guest must enter for 'open' lessons
ALTER TABLE "MarketplaceLesson" ADD COLUMN "accessMode" TEXT NOT NULL DEFAULT 'enrolled';
ALTER TABLE "MarketplaceLesson" ADD COLUMN "passcode" TEXT NOT NULL DEFAULT '';