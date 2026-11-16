CREATE DATABASE cinemaverse;
USE cinemaverse;
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";


DROP TABLE IF EXISTS ticket;
DROP TABLE IF EXISTS login;
DROP TABLE IF EXISTS Cinema;
DROP TABLE IF EXISTS film;
DROP TABLE IF EXISTS comment;
DROP TABLE IF EXISTS broadcast;


CREATE TABLE `broadcast` (
  `BroadCastId` int(100) NOT NULL,
  `Dates` date NOT NULL,
  `Time` varchar(100) NOT NULL,
  `FilmId` int(100) NOT NULL,
  `CinemaId` int(100) NOT NULL,
  `day` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



INSERT INTO `broadcast` (`BroadCastId`, `Dates`, `Time`, `FilmId`, `CinemaId`, `day`) VALUES
(1, '2025-12-04', '14:00', 1, 1, 'Mon'),
(2, '2025-12-04', '19:00', 2, 1, 'Mon'),
(7, '2025-12-05', '14:00', 25, 3, 'Mon'),
(9, '2025-12-07', '14:00', 25, 1, 'Mon'),
(10, '2025-12-04', '19:00', 2, 2, 'Thu');



CREATE TABLE `comment` (
  `commentId` int(100) NOT NULL,
  `FilmId` int(100) NOT NULL,
  `UserId` varchar(100) NOT NULL,
  `Comment` varchar(10000) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



INSERT INTO `comment` (`commentId`, `FilmId`, `UserId`, `Comment`) VALUES
(1, 1, 'guest1', 'Best!'),
(2, 4, 'guest2', 'I liked this movie.'),
(4, 1, 'mahnoor', 'Good movie.');



CREATE TABLE `film` (
  `FilmId` int(100) NOT NULL,
  `FilmName` varchar(100) NOT NULL,
  `Duration` varchar(100) NOT NULL,
  `Category` varchar(100) NOT NULL,
  `Language` varchar(100) NOT NULL,
  `Director` varchar(100) NOT NULL,
  `Description` varchar(10000) NOT NULL,
  `Poster` varchar(100) NOT NULL,
  `Trailer` varchar(100) NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



INSERT INTO `film` (`FilmId`, `FilmName`, `Duration`, `Category`, `Language`, `Director`, `Description`, `Poster`, `Trailer`) VALUES
(2, 'MALEFICENT: MISTRESS OF EVIL', '106', 'IIID', 'English, French', 'Joachim Rønning', 'The complex relationship of Maleficent and Aurora continues to be explored as they face new threats to the magical land of the Moors.', 'maleficent.jpg', NULL),
(3, 'TERMINATOR: DARK FATE', '110', 'IID', 'English', 'Tim Miller', 'Sarah Connor has returned from far away, and she is gearing up with a team of agents who will fight against T-1000.', '/uploads/posters/term-1764880925052.jpg', 'terminator.mp4'),
(21, 'Wake Up Dead Man: A Knives Out Mystery', '140', 'Crime', 'English', 'Rian Johnson', 'The third installment in the Knives Out franchise is titled Wake Up Dead Man: A Knives Out Mystery. It is a gothic, darker take on the classic "impossible crime" or locked-room mystery.', '/uploads/posters/wake-up-dead-man-poster-1764831166959.webp', '/uploads/trailers/ytdown.com_youtube_wake-up-dead-man-a-knives-out-mystery-of_media_ehm1k1jbybi_001_1080p-1764829281265.mp4'),
(22, 'Kill Bill: The Whole Bloody Affair', '281', 'Action, Mystery & Thriller', 'English', 'Quentin Tarantino', 'Kill Bill: The Whole Bloody Affair is Quentin Tarantino''s complete, four-hour-plus version of Kill Bill, combining Vol. 1 and Vol. 2 into a single epic film, presented with a new anime sequence and the original color footage for some scenes.', '/uploads/posters/$_57-1764829707028.JPG', '/uploads/trailers/ytdown.com_youtube_kill-bill-the-whole-bloody-affair-2025-o_media_-szkfgeqb6y_001_1080p-1764829479616-1764846362718.mp4'),
(23, 'Silent Night, Deadly Night', '97', 'Horror', 'English', 'Charles Sellier', 'A twisted reimagining of the controversial classic – After witnessing his parents’ brutal murder on Christmas Eve, Billy transforms into a Killer Santa, delivering a yearly spree of calculated, chilling violence. This year, his blood-soaked mission collides with love, as a young woman challenges him to confront his darkness. “Have you been naughty?”', '/uploads/posters/images-1764830090942.jpeg', '/uploads/trailers/ytdown.com_youtube_silent-night-deadly-night-official-trail_media_wii7yovqe7s_001_1080p-1764830033347.mp4'),
(24, 'Eternity', '112', 'Comedy, Romance', 'English', 'David Freyne', 'In an afterlife where souls have one week to decide where to spend eternity, Joan (Elizabeth Olsen) is faced with the impossible choice between the man she spent his life with (Miles Teller) and her first love (Callum Turner), who died young and has waited decades for her to arrive.', '/uploads/posters/60108_320_470-1764830455122.webp', '/uploads/trailers/ytdown.com_youtube_eternity-official-trailer-2-hd-a24_media_gzkoy6huvqq_001_1080p-1764830455123.mp4'),
(25, 'De De Pyaar De 2 (Hindi w/e.s.t.)', '146', 'Romantic, comedy', 'Hindi', 'Anshul Sharma', 'De De Pyaar De 2 is a 2025 Hindi romantic comedy sequel where a man, Ashish (Ajay Devgn), must now convince his girlfriend Ayesha''s (Rakul Preet Singh) family, who are around his own age, to approve of their relationship.', '/uploads/posters/60280_768_1024-1764845459181.jpg', '/uploads/trailers/ytdown.com_youtube_de-de-pyaar-de-2-official-trailer-ajay-d_media_59aip7sfiik_001_1080p-1764830562539.mp4'),
(26, 'Now You See Me: Now You Don''t', '113', 'Suspense', 'English', 'Ruben Fleischer', 'The Four Horsemen return along with a new generation of illusionists performing mind-melding twists, turns, surprises, and magic unlike anything ever captured on film. Directed by Ruben Fleischer (VENOM, UNCHARTED, ZOMBIELAND) the next installment of the NOW YOU SEE ME franchise stars Jesse Eisenberg, Woody Harrelson, Dave Franco, Isla Fisher, Justice Smith, Dominic Sessa, Ariana Greenblatt, with Rosamund Pike, and Morgan Freeman.', '/uploads/posters/images-3-1764830739228.jpeg', '/uploads/trailers/ytdown.com_youtube_kill-bill-the-whole-bloody-affair-2025-o_media_-szkfgeqb6y_001_1080p-1764830739228.mp4'),
(27, 'Neelofar (Urdu w/e.s.t.', '115', 'Romantic drama', 'Urdu', 'Ammar Rasool', 'Neelofar is a 2025 film starring the popular duo Mahira Khan and Fawad Khan, known for their reunion after previous collaborations like Humsafar. The film is a quiet, poetic reflection on love, perception, and invisible human connections, set against the backdrop of modern Lahore.', '/uploads/posters/60419_768_1024-1764830833393.jpg', '/uploads/trailers/ytdown.com_youtube_neelofar-official-trailer-out-now-fawad_media_xj18uwvio8y_001_1080p-1764830833394.mp4'),
(30, '3 Idiots', '1', 'Fun', 'English, Hindi, Urdu, Punjabi', 'Terry', 'Explore different humans in this world.', '/uploads/posters/img_8309-1764874678682.JPG', '/uploads/trailers/img_0120-1764876462576.MOV'),
(32, 'sdf', '20', 'sdf', 'sdf', 'sdf', '', NULL, NULL);



CREATE TABLE `Cinema` (
  `CinemaId` int(100) NOT NULL,
  `CinRow` varchar(100) NOT NULL,
  `CinCol` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



INSERT INTO `Cinema` (`CinemaId`, `CinRow`, `CinCol`) VALUES
(1, '5', '5'),
(2, '5', '5'),
(3, '5', '5'),
(4, '2', '5');



CREATE TABLE `login` (
  `UserId` varchar(100) NOT NULL,
  `PW` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



INSERT INTO `login` (`UserId`, `PW`) VALUES
('admin', '$2b$10$WTMamWMqgC8RGmR5yx4zXue3NxFOjTsnM2PW53HTnlRHwDkUZMAUK');


CREATE TABLE `ticket` (
  `TicketId` int(100) NOT NULL,
  `SeatRow` int(11) NOT NULL,
  `SeatCol` int(11) NOT NULL,
  `BroadCastId` int(100) NOT NULL,
  `Valid` varchar(100) NOT NULL,
  `UserId` varchar(100) NOT NULL,
  `TicketType` varchar(100) NOT NULL,
  `TicketFee` varchar(100) NOT NULL,
  `Email` varchar(100) NULL,
  `HoldUntil` varchar(100) NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



INSERT INTO `ticket` (`TicketId`, `SeatRow`, `SeatCol`, `BroadCastId`, `Valid`, `UserId`, `TicketType`, `TicketFee`, `Email`, `HoldUntil`) VALUES
(1, 4, 5, 1, 'YES', 'guest@example.com', 'Standard', '12.5', 'guest@example.com', NULL),
(2, 2, 5, 1, 'YES', 'guest@example.com', 'Standard', '12.5', 'guest@example.com', NULL),
(3, 3, 5, 1, 'YES', 'guest@example.com', 'Standard', '12.5', 'guest@example.com', NULL),
(4, 3, 4, 1, 'YES', 'guest@example.com', 'Standard', '12.5', 'guest@example.com', NULL),
(5, 4, 2, 1, 'YES', 'guest@example.com', 'Standard', '12.5', 'guest@example.com', NULL),
(6, 2, 4, 1, 'YES', 'guest@example.com', 'Standard', '12.5', 'guest@example.com', NULL),
(7, 2, 3, 1, 'YES', 'guest@example.com', 'Standard', '12.5', 'guest@example.com', NULL),
(8, 4, 5, 2, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(9, 3, 5, 2, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(10, 2, 5, 2, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(11, 2, 4, 2, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(12, 1, 4, 2, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(13, 3, 3, 2, 'EXPIRED', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', '2025-12-04 06:11:25'),
(14, 3, 3, 1, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(15, 3, 2, 1, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(16, 2, 2, 2, 'EXPIRED', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', '2025-12-04 07:43:44'),
(17, 1, 3, 2, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(18, 4, 2, 2, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(19, 5, 1, 2, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(20, 1, 4, 5, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(21, 1, 3, 5, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(22, 1, 2, 5, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(23, 1, 1, 5, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(24, 1, 5, 5, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(25, 3, 5, 3, 'HELD', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', '2025-12-04 07:57:03'),
(26, 5, 5, 2, 'EXPIRED', 'sdf@ggg', 'Standard', '12.50', 'sdf@ggg', '2025-12-04 08:29:02'),
(27, 4, 3, 2, 'YES', 'sdf2@', 'Standard', '12.50', 'sdf2@', NULL),
(28, 1, 2, 4, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(29, 1, 3, 4, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(30, 4, 5, 7, 'HELD', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', '2025-12-04 10:25:10'),
(31, 2, 5, 7, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(32, 3, 5, 7, 'HELD', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', '2025-12-04 11:25:21'),
(33, 5, 5, 7, 'HELD', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', '2025-12-04 11:29:22'),
(34, 3, 4, 7, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(35, 4, 3, 7, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(36, 2, 2, 2, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(37, 3, 1, 2, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(38, 3, 1, 10, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL),
(39, 3, 2, 10, 'YES', 'guest@example.com', 'Standard', '12.50', 'guest@example.com', NULL);


ALTER TABLE `broadcast`
  ADD PRIMARY KEY (`BroadCastId`);

ALTER TABLE `comment`
  ADD PRIMARY KEY (`commentId`);

ALTER TABLE `film`
  ADD PRIMARY KEY (`FilmId`);


ALTER TABLE `Cinema`
  ADD PRIMARY KEY (`CinemaId`);


ALTER TABLE `ticket`
  ADD PRIMARY KEY (`TicketId`);


ALTER TABLE `broadcast`
  MODIFY `BroadCastId` int(100) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;
O_INCREMENT for table `comment`

ALTER TABLE `comment`
  MODIFY `commentId` int(100) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

ALTER TABLE `film`
  MODIFY `FilmId` int(100) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=33;

ALTER TABLE `Cinema`
  MODIFY `CinemaId` int(100) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

ALTER TABLE `ticket`
  MODIFY `TicketId` int(100) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=40;
COMMIT;