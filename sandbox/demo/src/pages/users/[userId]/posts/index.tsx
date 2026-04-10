import { computed, Derive, ErrorBoundary, onMount, resource, setup } from "kiru"
import { useFileRouter } from "kiru/router"
import { db, Post, PostComment } from "$/db"
import { selectedUser } from "$/state/selectedUser"

export default function UserPostsPage() {
  const router = useFileRouter()
  const userId = computed(() => parseInt(router.state.params.value.userId))
  if (!userId.peek() || isNaN(userId.peek())) {
    router.navigate("/users")
    return null
  }

  const posts = resource(() => {
    const id = userId.value
    return db.collections.posts.findMany((p) => p.userId === id, {
      with: { postComments: true },
    })
  })
  const refetch = () => posts.refetch()

  onMount(() => {
    const onRelatedCommentChanged = (r: PostComment) =>
      posts.value?.some((p) => p.id === r.postId) && refetch()

    db.collections.posts.addEventListener("write|delete", refetch)
    db.collections.postComments.addEventListener("write|delete", onRelatedCommentChanged)

    return () => {
      db.collections.posts.removeEventListener("write|delete", refetch)
      db.collections.postComments.removeEventListener("write|delete", onRelatedCommentChanged)
    }
  })

  const onCreatePostClick = async () => {
    await db.collections.posts.create({ userId: userId.value, content: "New post" })
  }

  return () => (
    <div>
      <div style="display:flex;gap:2rem;align-items:center;">
        <h3 style="display:flex;gap:0.5rem;align-items:center">
          Posts by
          <span style="padding: 0.25rem 0.5rem; border-radius: 8px; background: #444; border: 1px solid #333; font-size: small">
            <UsernameView userId={userId.value} />
          </span>
        </h3>
        <button onclick={onCreatePostClick}>Create post</button>
      </div>

      <div>
        <ErrorBoundary fallback={(err) => <p>{err.message}</p>}>
          <Derive from={posts} fallback={<p>Loading posts...</p>}>
            {(posts, isStale) => (
              <div className={isStale ? "opacity-50" : "opacity-100"}>
                {posts.map((post) => (
                  <PostItemView key={post.id} post={post} />
                ))}
              </div>
            )}
          </Derive>
        </ErrorBoundary>
      </div>
    </div>
  )
}

function PostItemView({ post }: { post: Post & { postComments: PostComment[] } }) {
  return (
    <div>
      <div style="display:flex;gap:2rem;align-items:center;justify-content:space-between">
        <h4>{post.content}</h4>
        <UsernameView userId={post.userId} />
      </div>
      {selectedUser.value?.id === post.userId && (
        <button
          style="background: #f00; color: #fff; border: none; padding: 0.5rem 1rem; font-size: 1rem; cursor: pointer;"
          onclick={() => db.collections.posts.delete((p) => p.id === post.id)}
        >
          Delete
        </button>
      )}
      <PostCommentsView comments={post.postComments} postId={post.id} />
    </div>
  )
}

function PostCommentsView({ postId, comments }: { postId: string; comments: PostComment[] }) {
  const handleCreateComment = async () => {
    if (!selectedUser.value) {
      alert("Please select a user")
      return
    }
    await db.collections.postComments.create({
      postId,
      content: "New comment",
      userId: selectedUser.value.id,
    })
  }

  return (
    <>
      <button onclick={handleCreateComment} style="margin-bottom:8px">
        Add Comment
      </button>
      <div>
        {comments.map((comment) => (
          <div
            key={comment.id}
            style="display:flex;gap:2rem;align-items:center; background: #1a1a1a; padding: 0.5rem; border-radius: 8px;"
          >
            <p>{comment.content}</p>
            <UsernameView userId={comment.userId} />
          </div>
        ))}
      </div>
    </>
  )
}

interface UserNameViewProps {
  userId: number
}

const UsernameView: Kiru.FC<UserNameViewProps> = () => {
  const $ = setup<UserNameViewProps>()
  const userId = $.derive((p) => p.userId)
  const user = resource(() => db.collections.users.find(userId.value))

  return () => (
    <ErrorBoundary fallback={(err) => <p>{err.message}</p>}>
      <Derive from={user} fallback={<p>Loading...</p>}>
        {(user) => user?.name || "User not found"}
      </Derive>
    </ErrorBoundary>
  )
}
