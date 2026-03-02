import { FormEvent, useEffect, useState } from "react";
import { Navigate, NavLink, useLocation, useParams } from "react-router-dom";
import * as api from "../api";
import type { Feedback, MediaPost, Meeting, Member, Poll, Recipe, User } from "../types";
import { ClubScaffold } from "./clubs";
import {
  MeetingSection,
  NavIcon,
  NavTileContent,
  formatDateTime,
  formatShortDate,
  meetingSections,
  parseClubIDFromParams,
  parseMeetingIDFromParams,
  toDatetimeLocal
} from "./shared";

export function MeetingPage(props: { currentUser: User }) {
  const clubID = parseClubIDFromParams();
  const meetingID = parseMeetingIDFromParams();
  const location = useLocation();
  const params = useParams();
  const sectionRaw = params.section ?? "details";

  if (!meetingSections.includes(sectionRaw as MeetingSection)) {
    return <Navigate to="details" replace />;
  }
  const section = sectionRaw as MeetingSection;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");

  const [editTitle, setEditTitle] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editWhen, setEditWhen] = useState("");
  const [editCookbook, setEditCookbook] = useState("");
  const [editHostUserID, setEditHostUserID] = useState<number>(props.currentUser.id);
  const [editNotes, setEditNotes] = useState("");

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeTitle, setRecipeTitle] = useState("");
  const [recipeNotes, setRecipeNotes] = useState("");
  const [recipeSourceURL, setRecipeSourceURL] = useState("");

  const [media, setMedia] = useState<MediaPost[]>([]);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPickerKey, setMediaPickerKey] = useState(0);
  const [mediaCaption, setMediaCaption] = useState("");

  const [polls, setPolls] = useState<Poll[]>([]);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptionsRaw, setPollOptionsRaw] = useState("");
  const [pollClosesAt, setPollClosesAt] = useState("");

  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [isMeetingNavOpen, setIsMeetingNavOpen] = useState(false);

  const canManageMeeting = meeting?.created_by_user_id === props.currentUser.id;

  async function loadMeetingBase() {
    if (!meetingID || Number.isNaN(meetingID) || !clubID || Number.isNaN(clubID)) {
      setError("Invalid meeting or club id");
      return;
    }

    try {
      const [meetingRes, membersRes] = await Promise.all([api.getMeeting(meetingID), api.getClubMembers(clubID)]);
      setMeeting(meetingRes.meeting);
      setMembers(membersRes.members);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load meeting");
    }
  }

  useEffect(() => {
    void loadMeetingBase();
  }, [clubID, meetingID]);

  useEffect(() => {
    if (!meeting) {
      setEditTitle("");
      setEditAddress("");
      setEditWhen("");
      setEditCookbook("");
      setEditHostUserID(props.currentUser.id);
      setEditNotes("");
      return;
    }

    setEditTitle(meeting.title);
    setEditAddress(meeting.address);
    setEditWhen(toDatetimeLocal(meeting.scheduled_at));
    setEditCookbook(meeting.cookbook);
    setEditHostUserID(meeting.host_user_id);
    setEditNotes(meeting.notes);
  }, [meeting, props.currentUser.id]);

  useEffect(() => {
    async function loadSectionData() {
      if (!meetingID || Number.isNaN(meetingID)) {
        return;
      }

      try {
        if (section === "recipes") {
          const res = await api.getRecipes(meetingID);
          setRecipes(res.recipes);
        }
        if (section === "media") {
          const res = await api.getMedia(meetingID);
          setMedia(res.media);
        }
        if (section === "polls") {
          const res = await api.getPolls(meetingID);
          setPolls(res.polls);
        }
        if (section === "feedback") {
          const res = await api.getFeedback(meetingID);
          setFeedback(res.feedback);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load section data");
      }
    }
    void loadSectionData();
  }, [meetingID, section]);

  useEffect(() => {
    const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
    setIsMeetingNavOpen(!mobile);
  }, [clubID, meetingID, location.pathname]);

  async function handleSaveMeetingDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!meeting || !canManageMeeting) {
      return;
    }

    try {
      const res = await api.updateMeeting(meeting.id, {
        title: editTitle,
        address: editAddress,
        scheduled_at: editWhen,
        cookbook: editCookbook,
        cookbook_key: meeting.cookbook_key,
        cookbook_author: meeting.cookbook_author,
        cookbook_cover_url: meeting.cookbook_cover_url,
        cookbook_first_publish_year: meeting.cookbook_first_publish_year,
        host_user_id: editHostUserID,
        notes: editNotes
      });
      setMeeting(res.meeting);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update meeting details");
    }
  }

  async function handleEndMeeting() {
    if (!meeting || !canManageMeeting) {
      return;
    }

    try {
      const res = await api.endMeeting(meeting.id);
      setMeeting(res.meeting);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not end meeting");
    }
  }

  async function handleAddRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!meeting) {
      return;
    }

    try {
      const res = await api.addRecipe(meeting.id, {
        title: recipeTitle,
        notes: recipeNotes,
        source_url: recipeSourceURL
      });
      setRecipes((prev) => [res.recipe, ...prev]);
      setRecipeTitle("");
      setRecipeNotes("");
      setRecipeSourceURL("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save recipe");
    }
  }

  async function handleAddMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!meeting) {
      return;
    }
    if (!mediaFile) {
      setError("Please choose an image or video file.");
      return;
    }

    const detectedType: "image" | "video" = mediaFile.type.startsWith("video/") ? "video" : "image";

    try {
      const res = await api.addMediaFile(meeting.id, {
        file: mediaFile,
        media_type: detectedType,
        caption: mediaCaption
      });
      setMedia((prev) => [res.media, ...prev]);
      setMediaFile(null);
      setMediaPickerKey((prev) => prev + 1);
      setMediaCaption("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post media");
    }
  }

  async function handleCreatePoll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!meeting) {
      return;
    }

    const options = pollOptionsRaw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    try {
      const res = await api.createPoll(meeting.id, {
        question: pollQuestion,
        options,
        closes_at: pollClosesAt
      });
      setPolls((prev) => [res.poll, ...prev]);
      setPollQuestion("");
      setPollOptionsRaw("");
      setPollClosesAt("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create poll");
    }
  }

  async function handleVote(pollID: number, optionID: number) {
    try {
      const res = await api.voteOnPoll(pollID, optionID);
      setPolls((prev) => prev.map((poll) => (poll.id === pollID ? res.poll : poll)));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save vote");
    }
  }

  async function handleFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!meeting) {
      return;
    }

    try {
      await api.saveFeedback(meeting.id, { rating: feedbackRating, comment: feedbackComment });
      const res = await api.getFeedback(meeting.id);
      setFeedback(res.feedback);
      setFeedbackComment("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save feedback");
    }
  }

  return (
    <ClubScaffold
      clubID={clubID}
      title={meeting ? `Meeting: ${meeting.title}` : "Meeting"}
      error={error}
      onRefresh={loadMeetingBase}
      showClubNav={false}
      showBackToClubAction
    >
      {!meeting && <p className="empty-state">Meeting not found or you do not have access.</p>}

      {meeting && (
        <>
          <button
            type="button"
            className={isMeetingNavOpen ? "meeting-nav-toggle open" : "meeting-nav-toggle"}
            onClick={() => setIsMeetingNavOpen((value) => !value)}
          >
            <span className="nav-tile-icon">
              <NavIcon name="menu" />
            </span>
            <span>{isMeetingNavOpen ? "Hide Meeting Menu" : "Open Meeting Menu"}</span>
          </button>

          {isMeetingNavOpen && (
            <nav className="meeting-section-nav">
              <NavLink to={`/club/${clubID}/meeting/${meeting.id}/details`}>
                <NavTileContent icon="details" label="Details" />
              </NavLink>
              <NavLink to={`/club/${clubID}/meeting/${meeting.id}/recipes`}>
                <NavTileContent icon="recipes" label="Recipes" />
              </NavLink>
              <NavLink to={`/club/${clubID}/meeting/${meeting.id}/media`}>
                <NavTileContent icon="uploads" label="Uploads" />
              </NavLink>
              <NavLink to={`/club/${clubID}/meeting/${meeting.id}/polls`}>
                <NavTileContent icon="polls" label="Polls" />
              </NavLink>
              <NavLink to={`/club/${clubID}/meeting/${meeting.id}/feedback`}>
                <NavTileContent icon="feedback" label="Feedback" />
              </NavLink>
            </nav>
          )}

          {section === "details" && (
            <section className="panel-section highlight">
              <h3>{meeting.title}</h3>
              <p className="muted">Status: {meeting.ended_at ? `Ended on ${formatDateTime(meeting.ended_at)}` : "Active"}</p>
              <p>
                <strong>Where:</strong> {meeting.address}
              </p>
              <p>
                <strong>When:</strong> {formatDateTime(meeting.scheduled_at)}
              </p>
              <p>
                <strong>Cookbook:</strong> {meeting.cookbook}
              </p>
              {(meeting.cookbook_author || meeting.cookbook_first_publish_year > 0) && (
                <p className="muted">
                  {meeting.cookbook_author || "Unknown author"}
                  {meeting.cookbook_first_publish_year > 0 ? ` · First published ${meeting.cookbook_first_publish_year}` : ""}
                </p>
              )}
              {meeting.cookbook_cover_url && (
                <img className="cookbook-selected-cover" src={api.mediaUrl(meeting.cookbook_cover_url)} alt={meeting.cookbook} />
              )}
              {meeting.notes && <p className="muted">{meeting.notes}</p>}

              {canManageMeeting && !meeting.ended_at && (
                <div className="meeting-actions">
                  <button type="button" className="danger-button" onClick={() => void handleEndMeeting()}>
                    End Meeting Now
                  </button>
                </div>
              )}

              {canManageMeeting && (
                <section className="panel-section">
                  <h3>Edit Meeting Details</h3>
                  <form className="stack-form" onSubmit={handleSaveMeetingDetails}>
                    <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} placeholder="Meeting title" required />
                    <input
                      value={editAddress}
                      onChange={(event) => setEditAddress(event.target.value)}
                      placeholder="Address"
                      required
                    />
                    <input
                      type="datetime-local"
                      value={editWhen}
                      onChange={(event) => setEditWhen(event.target.value)}
                      required
                    />
                    <input
                      value={editCookbook}
                      onChange={(event) => setEditCookbook(event.target.value)}
                      placeholder="Cookbook"
                      required
                    />
                    <label>
                      Host
                      <select value={editHostUserID} onChange={(event) => setEditHostUserID(Number(event.target.value))}>
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.display_name} (@{member.username})
                          </option>
                        ))}
                      </select>
                    </label>
                    <textarea value={editNotes} onChange={(event) => setEditNotes(event.target.value)} placeholder="Notes" rows={3} />
                    <button type="submit">Save Changes</button>
                  </form>
                </section>
              )}
            </section>
          )}

          {section === "recipes" && (
            <section className="panel-section">
              <h3>Choose Recipe</h3>
              <form className="stack-form" onSubmit={handleAddRecipe}>
                <input value={recipeTitle} onChange={(event) => setRecipeTitle(event.target.value)} placeholder="Recipe name" required />
                <textarea
                  value={recipeNotes}
                  onChange={(event) => setRecipeNotes(event.target.value)}
                  placeholder="What are you making?"
                  rows={3}
                />
                <input
                  value={recipeSourceURL}
                  onChange={(event) => setRecipeSourceURL(event.target.value)}
                  placeholder="Optional source URL"
                />
                <button type="submit">Save Recipe</button>
              </form>

              <ul className="simple-list">
                {recipes.map((recipe) => (
                  <li key={recipe.id}>
                    <span>
                      <strong>{recipe.title}</strong> by {recipe.user_name}
                    </span>
                    <small>{recipe.notes}</small>
                  </li>
                ))}
                {recipes.length === 0 && <li className="muted">No recipes yet.</li>}
              </ul>
            </section>
          )}

          {section === "media" && (
            <section className="panel-section">
              <h3>Uploads</h3>
              <form className="stack-form upload-form" onSubmit={handleAddMedia}>
                <label className={mediaFile ? "upload-picker selected" : "upload-picker"}>
                  <input
                    key={mediaPickerKey}
                    type="file"
                    accept="image/*,video/*"
                    onChange={(event) => setMediaFile(event.target.files?.[0] ?? null)}
                    required
                  />
                  <span className="upload-picker-icon">
                    <NavIcon name="uploads" />
                  </span>
                  <span className="upload-picker-title">{mediaFile ? "File selected" : "Upload image or video"}</span>
                  <span className="upload-picker-meta">{mediaFile ? mediaFile.name : "Tap to choose from your device"}</span>
                </label>
                <input value={mediaCaption} onChange={(event) => setMediaCaption(event.target.value)} placeholder="Caption" />
                <button type="submit" disabled={!mediaFile}>
                  Post Upload
                </button>
              </form>

              <div className="gallery-grid">
                {media.map((item) => (
                  <article key={item.id} className="gallery-item">
                    {item.media_type === "video" ? (
                      <video controls src={api.mediaUrl(item.media_url)} />
                    ) : (
                      <img src={api.mediaUrl(item.media_url)} alt={item.caption || "Meeting media"} />
                    )}
                    <p>{item.caption || "Shared without caption"}</p>
                    <small>by {item.user_name}</small>
                  </article>
                ))}
                {media.length === 0 && <p className="muted">No uploads yet.</p>}
              </div>
            </section>
          )}

          {section === "polls" && (
            <section className="panel-section">
              <h3>Polls</h3>
              <form className="stack-form" onSubmit={handleCreatePoll}>
                <input value={pollQuestion} onChange={(event) => setPollQuestion(event.target.value)} placeholder="Poll question" required />
                <textarea
                  value={pollOptionsRaw}
                  onChange={(event) => setPollOptionsRaw(event.target.value)}
                  placeholder="One option per line"
                  rows={4}
                  required
                />
                <label>
                  Close date (optional)
                  <input type="datetime-local" value={pollClosesAt} onChange={(event) => setPollClosesAt(event.target.value)} />
                </label>
                <button type="submit">Create Poll</button>
              </form>

              <div className="poll-list">
                {polls.map((poll) => (
                  <article key={poll.id} className="poll-card">
                    <h3>{poll.question}</h3>
                    <p className="muted">
                      by {poll.creator} · closes {formatShortDate(poll.closes_at)}
                    </p>
                    <div className="poll-options">
                      {poll.options.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={option.voted_by_me ? "poll-option voted" : "poll-option"}
                          onClick={() => void handleVote(poll.id, option.id)}
                        >
                          <span>{option.option}</span>
                          <strong>{option.vote_count}</strong>
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
                {polls.length === 0 && <p className="muted">No polls yet.</p>}
              </div>
            </section>
          )}

          {section === "feedback" && (
            <section className="panel-section">
              <h3>Post-Meeting Feedback</h3>
              <form className="stack-form" onSubmit={handleFeedback}>
                <label>
                  Rating
                  <select value={feedbackRating} onChange={(event) => setFeedbackRating(Number(event.target.value))}>
                    <option value={5}>5 - Excellent</option>
                    <option value={4}>4 - Great</option>
                    <option value={3}>3 - Good</option>
                    <option value={2}>2 - Needs work</option>
                    <option value={1}>1 - Poor</option>
                  </select>
                </label>
                <textarea
                  value={feedbackComment}
                  onChange={(event) => setFeedbackComment(event.target.value)}
                  placeholder="What worked and what should change next time?"
                  rows={3}
                />
                <button type="submit">Save Feedback</button>
              </form>

              <ul className="simple-list">
                {feedback.map((item) => (
                  <li key={item.id}>
                    <span>
                      <strong>{item.user_name}</strong> rated {item.rating}/5
                    </span>
                    <small>{item.comment}</small>
                  </li>
                ))}
                {feedback.length === 0 && <li className="muted">No feedback yet.</li>}
              </ul>
            </section>
          )}
        </>
      )}
    </ClubScaffold>
  );
}
